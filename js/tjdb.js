/*
* This file contains code for persisting information, conceptually rows of a table where each
* row represents a "jot" of text. These are displayed with a time stamp and edit and delete controls in the html.
*
* The data can be persisted locally across broswer sessions (but limited to the same browser brand) on the local
* machine via the IndexedDB mechanism in HTML5.
*
* The data can also be persisted on either or both Dropbox and Google Drive.
*
* The application can be run either from a localhost or over the web.
*
* The fact that IndexedDB creates a database for a web application locally is very useful but there are some
* serious limitations that might argue against going solely that route. One is that the database is tied to
* the browser type so that recording jots in one browser only using IndexedDB means those jots will only be
* viewable in that browser. Jots created in Firefox and Chrome do not mix, etc. While there might be the odd
* occasion to exploit walling off one set of jots from another, most often you'd also like to have a way to
* have the same jots available across devices and browsers and apps and having them sync to a common store in
* the cloud.
*
* We use NimbusBase to allow persistence remotely on either Dropbox or Google Drive.
*
*
*/

// Beginning stab at something that could become Thought Jot

//TODO: option for storing stuff only or not at all on local machine using IndexedDB
//TODO: option for storing stuff only or not at all on either\both GDrive and Dropbox
//TODO: change all "todo" stuff to jot stuff

// Let's encapsulate our stuff in a namespace
var tj = {};
tj.editing = null;
tj.jots = [];
tj.indexedDB = {};
tj.STORE_IDB = 1;
tj.STORE_DROPBOX = 2;
tj.STORE_GDRIVE = 4;
tj.STORE_BITTORRENT_SYNC = 8;
tj.STORE_MASK = tj.STORE_IDB | tj.STORE_DROPBOX;   // TODO make user controlled

//
// NimbusBase sync string for persisting to DropBox
//var sync_string = "eyJHRHJpdmUiOnsia2V5IjoiIiwic2NvcGUiOiIiLCJhcHBfbmFtZSI6IiJ9LCJEcm9wYm94Ijp7ImtleSI6Im5sc3pqNXhyaGxiMWs1cCIsInNlY3JldCI6ImZvOGEyNDRzZ2RmdGpiZiIsImFwcF9uYW1lIjoidGpiZXRhIn19"; 
//

//var tj.indexedDB = {};

// open the database

	        //3-20-14 BUG iDBkey will not in general match the time in the remote object so this doesn't work as is
	        //for getting the remote object corresponding to the jot. But since we are still on the road of allowing
	        //mixed storage options we need something that is both unique and for sure the same in both local and
	        //remote versions and since "time" is a NBase keyword we can't necessarily use that field even though
	        //a time value is the most logical choice for the "common key" we need. Also of course if user is only
	        //storing locally we can't just use whatever NBase set "time" to on an update, which it does, or the id
	        //field it sets since that won't exist if no remote storage is being used or is unavailable. However, if
	        //we are storing remotely as well then the NB id field is obviously the thing to use to link our local
	        //and remote records.
	        //
	        // So I think
	        //we need to update our schema, which we need to do anyway, and have a timestamp that we create generate
	        //on the client side but use in both the client side and the remote object. Time to save this version of
	        //things as this is a major change and will be a onupgradeneeded event on the indexedDB client side meaning
	        //everthing previous is moot.
	        //The new schema:  the commonKey is a timestamp of local jot creation (which should not be a prob assuming
	        //                 a single user with multiple devices running Thought Jot). We also have a 
	        // IndexedDB on client side:
            // {keyPath: "commonKey"}, "nimbusID", nimbusTime, title, jot", "tagList", "extra", isTodo", "done", 
	        // NimbusBase:
	        // commonKey, id, time, title, jot, tagList, extra, isTodo, done
	        //

tj.indexedDB.db = null;
tj.indexedDB.IDB_SCHEMA_VERSION = 7;
tj.indexedDB.order = "prev";   // default to showing newest jots at top
tj.indexedDB.onerror = function (e){
    console.log(e);
};

tj.indexedDB.open = function() {
    "use strict";

    // Warn user that we do not support early versions of indexedDB
    if(!window.indexedDB) {    
    	window.alert("Your browser doesn't support a stable version of IndexedDB, which Thought Jot uses.\nSome features might not be available or might not work correctly.");
    }
    //TODO Get user's initial preferences for local and remote storage
    //TODO Get user's access info for their prefered remote storage locations

    var request = indexedDB.open("todos", tj.indexedDB.IDB_SCHEMA_VERSION);  // returns an IDBOpenDBRequest object
	// see https://developer.mozilla.org/en-US/docs/IndexedDB/Using_IndexedDB
    request.onupgradeneeded = function(e) {
		var db = e.target.result;
		console.log("tj.indexedDB.open: in request.onupgradeneeded() callback");
		// A versionchange transaction is started automatically.
		e.target.transaction.onerror = tj.indexedDB.onerror;
		//TODO remove delete "todo" store once we are cooking with the new schema
		if(db.objectStoreNames.contains("todo")) {
			db.deleteObjectStore("todo");
		}		
		if(db.objectStoreNames.contains("Jots")) {
			db.deleteObjectStore("Jots");
		}		
		var store = db.createObjectStore("Jots", {keyPath: "commonKeyTS"});
	};
	
	request.onsuccess = function(e) {
		console.log("tj.indexedDB.open: in request.onsuccess() callback");
		tj.indexedDB.db = e.target.result;
		// update the DOM with all the jots we got
		tj.indexedDB.showAllJots();
	};
	
	request.onerror = tj.indexedDB.onerror;
};

tj.indexedDB.addJot = function(jotText) {
	//TODO since we are saving to multiple places we need to check for errors back from each store location
	//     and recover/report
	//TODO must change data to be same in indexedDB and remote records

    var htmlizedText = htmlizeText(jotText);
    var commonKey = new Date().getTime();
    var nbID = null;

	// add the jot to cloud storage location(s)
	if(tj.STORE_MASK & tj.STORE_DROPBOX == tj.STORE_DROPBOX) {
        //nbx.Jots = Nimbus.Model.setup("Jots", ["commonKeyTS", "id", "time", "modTime", "title", "jot", "tagList", "extra", "isTodo", "done"]);
        //OLD nbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "time"]);
        console.log("addJot: attempting store of real jot on Dropbox");
        //var now = Date().toString();
        //NimbusBase populates the id field (specified in nb.js) automatically, then we get it and put it in the iDB record
        nbx.jotreal = nbx.Jots.create({"commonKeyTS":commonKey, "time":commonKey, "modTime":commonKey,
                                       "title":"none", "jot":htmlizedText, "tagList":"none", "extra":"none", "isTodo":false, "done":false});
        nbID = nbx.jotreal.id;
        console.log("Nimbus instance count is now: " + nbx.Jots.count());
        console.log("addJot nbx.jotreal.id = " + nbID);
        console.log("addJot nbx.jotreal.time = " + nbx.jotreal.time);

        //nbx.jotreal.jot = "does save do something to the time field?";
        //nbx.jotreal.save();
        //nbx.Jots.sync_all(function() {console.log("nbx.Jots.sync_all() callback called.")});
    }

    // add the jot locally, saving in it the id of the remote store copy
    //TODO refactor into sep function so can be used by addMissingLocalJots
	if(tj.STORE_MASK & tj.STORE_IDB == tj.STORE_IDB) {
    	var db = tj.indexedDB.db;
    	var trans = db.transaction(["Jots"], "readwrite");
    	trans.oncomplete = function(e) {
    		console.log("addJot trans.oncomplete() called");
    	}
    	trans.onerror = function(e) {
    		console.log("addJot trans.onerror() called");
    		console.log(trans.error);
    	}
	        // IndexedDB on client side new schema 3-22-2014:
            // {keyPath: "commonKeyTS"}, "nimbusID", nimbusTime, modTime, title, jot", "tagList", "extra", isTodo", "done", 
    	var store = trans.objectStore("Jots");
    	var row = {"commonKeyTS":commonKey, "nimbusID":nbID, "nimbusTime":"none", "modTime":commonKey,
    	           "title":"none", "jot": htmlizedText, "tagList":"none", "extra":"none", "isTodo":false, "done":false};
    	var request = store.add(row);
    	    	
    	request.onsuccess = function(e) {
    		console.log("addJot in put request.onsuccess");
    		//TODO OPTIMIZE to just slip a new div in if possible at either top or bottom
    		//hmmm best way to maintain array of layout so that we can do on the fly toggling
    		//of the contenteditability of a jot. This means at a minimum we need to be able
    		//to easily get the text container (p or div) that corresponds to a clicked
    		//edit/save link. Ahhh but that's what we do in render
    	
	    	//var key = e.target.result;   // the key for the new row just added to the indexedDB
	    	//var idbReq = store.get(key);
	    	//var therow = idbReq.result;
		    var jotDiv = renderJot(row);

		    var jotsContainer = document.getElementById("jotItems");
	        if(tj.indexedDB.order === "prev")  {   // newest are currently shown first
	        	var first = jotsContainer.firstChild;
	            jotsContainer.insertBefore(jotDiv, jotsContainer.firstChild);
	        }
	        else {  // oldest are currently shown first
                jotsContainer.appendChild(jotDiv);
            }
    		///tj.indexedDB.showAllJots();    // cause all jots to rerender - NO MORE
    	};
    	
    	request.onerror = function(e) {
    		console.log(e.value);
    	};
    }
};

//TODO we are getting them all from the current local store instead of from a remote and possibly aggregated from
//several devices store. The user needs to be in control of this (and perhaps we even over very fine granularity you
// can decide which jots get put remotely and which don't) but the default should be to aggregrate on the remote store(s)
// and sync on connect the local stores updating either side from the other appropriately.
// 3-23-2014 OK today's big job is to be able to see on device A all jots from multiple devices (i.e. all jots on the 
// remote store). This means we have to be using the remote store as the source for this function. And more than that,
// there might be local jots that haven't been written for some reason. So we need to do a superset of the local and
// remote jots really.
/*
*   Clears all jots on the page and re-renders them. Used on open, reload, order toggling or filtering. Generally not
*   used just when a single jot is added or deleted or edited. In those cases we update the DOM directly.
*/
tj.indexedDB.showAllJots = function() {
	console.log("in showAllJots");

    // get all the remote jots and sort them
    var localJots = [];
    var pushToRemote = [];
    var remoteJots = nbx.Jots.all();
    var flip = (tj.indexedDB.order === "prev") ? -1 : 1;
    if(remoteJots.length > 0) {
    	remoteJots.sort(function(a,b) {
            return flip * (a - b);
    	});
    }

	// get all the local jots and see if they all exist on the remote store(s)
	var jotsContainer = document.getElementById("jotItems");
	jotsContainer.innerHTML = "";    // delete all the jotdivs as we are about to rereneder them all
	
	var db = tj.indexedDB.db;
	var trans = db.transaction(["Jots"], "readonly");
	trans.oncomplete = function(e) {
		console.log("showAllJots transaction.oncomplete() called");
	};
	trans.onerror = function(e) {
		console.log("showAllJots transaction.onerror() called");
	}

	var store = trans.objectStore("Jots");	
	var keyRange = IDBKeyRange.lowerBound(0);
	var cursorRequest = store.openCursor(keyRange, tj.indexedDB.order);
	
	cursorRequest.onsuccess = function(e) {
		console.log("showAllJots in cursorRequest.onsuccess()")
		var result = e.target.result;
		if(!!result == false) {  // the !! ensures result becomes true boolean value
			// there are no more locally stored rows in the cursor
			// see if there are any remote jots not yet local
			var missingLocalVersions = remoteJotsNotInLocalStore(localJots, remoteJots);
			console.log("Number of Jots local but not remote:   " + pushToRemote.length);
			console.log("Number of Jots remote but not local:   " + missingLocalVersions.length);
			if(missingLocalVersions.length > 0) {
				for(i = 0; i < missingLocalVersions.length; i++) {
				    addMissingRemoteJot(missingLocalVersions[i]);
				}
				tj.indexedDB.showAllJots();
			}
		    return;
		}

        // Deal with next row in the cursor and remember it if it is not stored remotely yet.
        // If the user has remote storage enabled there should typically be no cases of this.
		var newJotDiv = renderJot(result.value);    // result.value is essentially a table row
		localJots.push(result.value);
		var sync = isLocalJotInRemoteStore(result.value, remoteJots);
		if(!sync) {
			pushToRemote.push(result.value);
		}
		jotsContainer.appendChild(newJotDiv);

		//result.continue();    // compiler warning is bogus and due to 'continue' being a javascript keyword
		result['continue']();    // solution to warning, and for IE8 if we care
	};
	
	cursorRequest.onerror = tj.indexedDB.onerror;
};

/* Adds a jot that is on the remote store but not in our local indexedDB store to the local store. Most likely
*  the jot is not local because it was added via another device or browswer. Does not cause page redraw. It is
*  assumed that generally there will be several missing jots to add. Rather than try to insert each one in the
*  correct commonKey timestamp based location, a call to showAllJots will be made after all missing jots have
*  been added.
*/
function addMissingRemoteJot(missing) {
    	var db = tj.indexedDB.db;
    	var trans = db.transaction(["Jots"], "readwrite");
    	trans.oncomplete = function(e) {
    		console.log("addMissingLocalJot trans.oncomplete() called");
    	}
    	trans.onerror = function(e) {
    		console.log("addMissingLocalJot trans.onerror() called");
    		console.log(trans.error);
    	}
	        // IndexedDB on client side new schema 3-22-2014:
            // {keyPath: "commonKeyTS"}, "nimbusID", nimbusTime, modTime, title, jot", "tagList", "extra", isTodo", "done", 
    	var store = trans.objectStore("Jots");
    	var row = {"commonKeyTS":missing.commonKeyTS, "nimbusID":missing.id, "nimbusTime":missing.time, "modTime":missing.modTime,
    	           "title":missing.title, "jot":missing.jot, "tagList":missing.tagList, "extra":missing.extra, "isTodo":missing.isTodo, "done":missing.done};
    	var request = store.add(row);
    	    	
    	request.onsuccess = function(e) {
    		console.log("addMissingLocalJot in put request.onsuccess");
    	};
    	
    	request.onerror = function(e) {
    		console.log(e.value);
    	};
}

/* Returns whether or not a local jot exists in the remote store */
function isLocalJotInRemoteStore(localJot, remoteJots) {
	//TODO need to optimize this totally simplistic and bad performance search
	//especially since we've already sorted the remoteJots array
	for(i = 0; i < remoteJots.length; i++) {
        if(remoteJots[i].commonKeyTS == localJot.commonKeyTS)
        	return true;
	}
	return false;
}

/* Returns an array of remote jot records not in the local store */
function remoteJotsNotInLocalStore(localJots, remoteJots) {
	var missingLocalJots = [];
	for(i = 0; i < remoteJots.length; i++) {
		var foundRemoteLocally = false;
		for(j = 0; j < localJots.length; j++) {
            if(remoteJots[i].commonKeyTS == localJots[j].commonKeyTS)
        	    foundRemoteLocally = true;
		}
		if(!foundRemoteLocally) {
			missingLocalJots.push(remoteJots[i]);
		}
	}
	return missingLocalJots;
}

/*
* Creates all the HTML elements for a single jot and sets them into a new div ready to be added to the
* all-jots-div. The caller is reponsible for adding the retuned div to the jotItems div.
*/
function renderJot(row) {	
	
	// a div for each jot
	var jdiv = document.createElement("div");
	jdiv.className = "jotdiv";
	// a paragraph for the timestamp
	var pts = document.createElement("span");
	pts.className = "timestamp";
	// a paragraph for the jot - simple for now: just one basic paragraph is all we handle
	var pjot = document.createElement("p");
	pjot.className = "jottext";

	var dellink = document.createElement("a");
	dellink.className = "delete";
	dellink.textContent = " [Delete]";
	var editlink = document.createElement("a");
	editlink.className = "edit";
	editlink.title = "Edit this jot"
	//editlink.textContent = " [Edit]";
	editimage = document.createElement("img");
	editimage.src = ".\/images\/pen32.png"
	//var ts = toString(row.timeStamp);

    // THIS is the place to save the edit/save link <-> jot text containing element relationship for toggling editability
    // the thing is array or object. array would be nice because it lets us know the order of things as displayed but do
    // we need that really? an object allows us to have an associative list like a hash where the edit link can be the key
    // and the value is the text containing p (or div if we go that way). Also, when we move to not rerendering all the jots
    // upon deletion or addition we will need to know which jotdiv node to remove (this does not arise in the rerender all
    // way because we just remove from the indexedDB and then rerender all that are left in order) so we need an
    // delete link <-> jotdiv association AND we also need a connection between the indexedDB record and the jotdiv - or
    // do we need that last one? Let's see we get the keyPath from the delete link and that gives us the indDB record but
    // that alone doesn't give us the jotdiv --- so like the edit link we need a more direct assoc to in this case the jotdiv
    // and the delete link --- WAIT why not put what we are going to need into the del and edit event listeners then the issue
    // is solved without any arrays or assoc objects -- WOW is that right? Actually, that worked great! No need for lists
    // of associations and all that entails mgmt-wise. 

	//var dt = new Date(row.timeStamp);   // get a Date obj back so we can call some presentation methods
	var dt = new Date(row.commonKeyTS);   // get a Date obj back so we can call some presentation methods
	
	//var t = document.createTextNode(dt.toDateString() + "at " + dt.toTimeString() + ": " + row.text);
	pts.textContent = "Jotted on " + dt.toDateString() + " at " + dt.toLocaleTimeString() + ":";
	//pjot.textContent = row.text;
	//pjot.innerHTML = row.text;
	pjot.innerHTML = row.jot;
	//t.data = row.text;
	//console.log("in renderJot");
	// wire up Delete link handler and pass the inner deleteJot the keyPath and jotdiv it will need
	dellink.addEventListener("click", function(e) {
		//tj.indexedDB.deleteJot(row.text);
		var yesno = confirm("Are you sure you want to delete this jot?\n\nThis is not undoable.");
		if(yesno) {
		    tj.indexedDB.deleteJot(row.commonKeyTS, jdiv);
        }
	});
	
	editlink.addEventListener("click", function(e) {
		//tj.indexedDB.deleteJot(row.text);
		tj.indexedDB.editJot(this, row.commonKeyTS, pjot);
	});
	
	jdiv.appendChild(pts);
	editlink.appendChild(editimage);
	jdiv.appendChild(editlink);
	jdiv.appendChild(dellink);
	jdiv.appendChild(pjot);
	return jdiv;
}

/*
* Makes the jot contenteditable if no jot currently is: only one jot can be editable at a time.
* If the jot is currently editable then it is set not editable. Changes the link image appropriately.
*
* editLink - The in-jot-div edit/save link (i.e. the pencil icon button) that received the click.
* jotElement - The element containing the jot text (currently a p element, might become a div with sep p's in future...)
*/
//TODO now we need to actually save the edits and persist the changes.
//this is tricky for two reasons
//1. the content in the p we are setting to contenteditable has already been htmlized with <br> and <a> elements
//   and that is what is stored in both our local indexedDB database and remotely. so first we need to take a look
//   at what we can get from the p when they are done - do we get plaintext or html
//
//2. when we go to save it in the database we want to update the contents of a row, but do we htmlize it again. What
//   I don't want to get into is going back and forth - i don't want to un-htmlize. Maybe this means we should only be
//   persisting plain text and htmlizing it only for display on the page. but then how do we preserve creturns - i think
//   the available DOM methods strip out the creturns... time to experiment.
tj.indexedDB.editJot = function(editLink, iDBkey, jotElement) {
    //console.log("tj.indexedDB.editJot()");
    var newContent = jotElement.innerHTML;

    var editimg = editLink.childNodes[0];
    if(tj.editing != null && editLink != tj.editing) {
    	alert("Only one jot can be edited at a time.");
    	return;
    }

    if(editLink.title == "Edit this jot") {
        editLink.title = "Save the edit";
        editimg.src = ".\/images\/tick32.png";
	    jotElement.setAttribute("contenteditable", true);
	    jotElement.className = "jottext_editing";
        tj.editing = editLink;
    }
    else {    // time to save the edit
		var db = tj.indexedDB.db;
		var trans = db.transaction(["Jots"], "readwrite");
		trans.oncomplete = function(e) {
			console.log("editJot transaction.oncomplete() called");
		};
		trans.onerror = function(e) {
			console.log("editJot transaction.onerror() called");
		}
		var store = trans.objectStore("Jots");
        var request = store.get(iDBkey);
        request.onerror = function(e) {
            console.log("editJot request.onerror() called");
        };
        request.onsuccess = function(e) {
            console.log("editJot request.onsuccess() called");

            var row = request.result;
            //row.text = jotElement.innerHTML;
            row.jot = newContent;
            console.log(row.commonKeyTS);
            // a nested request to update the indexedDB
            var requestUpdate = store.put(row);
            requestUpdate.onerror = function(e) {
                console.log("editJot requestUpdate.onerror() called");
            };
            requestUpdate.onsuccess = function(e) {
                console.log("editJot requestUpdate.onsuccess() called");
            };
        };
        
        //now we need to update the remote storage as well

	    if(tj.STORE_MASK & tj.STORE_DROPBOX == tj.STORE_DROPBOX) {
	        //nbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "time"]);
	        console.log("editJot: updating Dropbox, except we aren't really yet!");

	        var nbJot = nbx.Jots.findByAttribute("commonKeyTS", iDBkey);
	        nbJot.jot = newContent;
	        nbJot.save();
	        nbx.Jots.sync_all(function() {console.log("tj.indexedDB.editJot nbx.Jots.sync_all() callback called.")});
	    }
 
        //TODO should we move this into the requestUpdate.onsuccess?
        //AND if there was an indexedDB error we should probably revert the page text...?
        editLink.title = "Edit this jot";
        editimg.src = ".\/images\/pen32.png";
	    jotElement.setAttribute("contenteditable", false);
        jotElement.className = "jottext";
        tj.editing = null;
        //var textcontent = jotElement.textContent;    // works on FF, Chrome  - looses markup AND NEWLINES! (which are markup really)
        //var wholecontent = jotElement.wholeText;
        //var innerttextcontent = jotElement.innerText;// works on Chrome - looses <a> markup and converts <b> to crlf apparently
        //var htmlcontent = jotElement.innerHTML;      // works on FF, Chrome - retains the htmlization
        //var datacontent = jotElement.data;
        //var x = 3;

        // so we have a problem indeed as Firefox does not support inner text which is a bummer as what it does is return
        // basically our prehtmlized text, which we could then easily rehtmlize after the editing is done. ugh...
        // SINCE the user can't enter markup anyway (we'd need a whole editor for that) and them entering normal text without
        // new carriage returns will still come across in the innerHTML maybe we should go with that for now. We really need
        // a full editor in place when a jot goes editable...
        // Actually, adding newlines causes the innerHTML to show <div><br></div> type stuff and similarly for spaces they
        // become <div>&nbsp;... not too suprising really
    }
};

tj.indexedDB.deleteJot = function(iDBkey, jotDiv) {

	// delete the local indexedDB version of the jot
	if(tj.STORE_MASK & tj.STORE_IDB == tj.STORE_IDB) {
		var db = tj.indexedDB.db;
		var trans = db.transaction(["Jots"], "readwrite");
		trans.oncomplete = function(e) {
			console.log("deleteJot transaction.oncomplete() called");
		};
		trans.onerror = function(e) {
			console.log("deleteJot transaction.onerror() called");
		}
		var store = trans.objectStore("Jots");
		
		// deletel the indexedDB entry for this jot
		var request = store['delete'](iDBkey);    // can't do store.delete(id) due to delete being a keyword, just like continue issue
		
		request.onsuccess = function(e) {
			// delete the view of the jot by removing it's jotDiv - no more rerendering all the jot view's html!
		    var jotsContainer = document.getElementById("jotItems");
	        jotsContainer.removeChild(jotDiv);
			//tj.indexedDB.showAllJots();   // NO LONGER NEEDED rerender with deleted item gone
		};
		
		request.onerror = function(e) {
			console.log(e);
		};
    }

    // delete the Dropbox version
	if(tj.STORE_MASK & tj.STORE_DROPBOX == tj.STORE_DROPBOX) {
	    var nbJot = nbx.Jots.findByAttribute("commonKeyTS", iDBkey);
        nbJot.destroy();
    }
};

function indexedDB_init() {
	console.log("doing indexedDB init()");
	tj.indexedDB.open();  // shows any data previously stored
}

// 3-23-2014 removed because we need nimbus to be ready before call to showAllJots so moved init
// call into nbx.open so that call to nbx.Jots.all() in showAllJots will return nonzero length array
//TODO that seems to work but raises the issue of what happens if the route through nb.open is different
// because we weren't connect yet - then we might never call indexedDB_init
//window.addEventListener("DOMContentLoaded", indexedDB_init, false);

//
// Our action handlers for sort order, date range, etc.,.
//

// toogle sort order of displayed jots
function toggleOrdering() {
	var toggle = document.getElementById('toggleOrder');
	if(tj.indexedDB.order === "prev") {
		toggle.value = "Showing oldest first";
		toggle.title = "Press to show newest jots first.";
		tj.indexedDB.order = "next";
	}
	else {
		toggle.value = "Showing newest first";
		toggle.title = "Press to show oldest jots first.";
		tj.indexedDB.order = "prev";
	}
	tj.indexedDB.showAllJots(); 
}

// add contents of text area as a new jot
function addJot() {
	var jotComposeArea = document.getElementById('jot_composer');
	tj.indexedDB.addJot(jotComposeArea.value);

	// clear the compose area of the input text
	jotComposeArea.value = '';
}

function removeAll() {
    var yesno = confirm("Whoa! Deleting all jots is not reversible. Are you sure you want to do this?");
	if(yesno) {
	    tj.indexedDB.emptyDB();
	}	
}

tj.indexedDB.emptyDB = function() {
	alert("in tj.indexedDB.emptyDB");
	var request = indexedDB.open("todos", tj.indexedDB.IDB_SCHEMA_VERSION);  // returns an IDBOpenDBRequest object
	// see https://developer.mozilla.org/en-US/docs/IndexedDB/Using_IndexedDB
	request.onupgradeneeded = function(e) {
		alert("emptyDB in request.onupgradeneeded");
		var db = e.target.result;
		// A versionchange transaction is tarted automatically.
		e.target.transaction.onerror = tj.indexedDB.onerror;
		console.log("deleting objectstore");
		
		var store = db.deleteObjectStore("Jots");
	};	
};

/*
* Worker bee function that lets user's carriage returns shine through.
*   Very simple for now: we just replace n returns with with n <br />
*   elements. We do not yet try to create actual separate html
*   paragraphs.
*
*   Also, we attempt to recognize urls and wrap them in <a></a> to make
*   them into real links within the jot.
*
*   That's all for the moment.
*/
function htmlizeText(text) {
	// converts url strings in a jot to actual links - currently assuming no already existing <a> stuff in the jot text
	
    //var parse_url = /^(?:([A-Za-z]+):)?(\/{0,3})([0-9.\-A-Za-z]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?(?:#(.*))?/$;
	//var parse_url = /[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi;
	//var parse_url = /((http|ftp|https):\/\/)?[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/g;  // like all three: only sort of works
	
	//OK I've mod'd and munged and this works pretty well, probably has leaks, and doesn't yet handle
	//things like "file:///C:/WebSites/ThoughtJotBasic/tj.html" but it's definitely a good start
	//
	//refs: started with /(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/
	//from: http://stackoverflow.com/questions/8188645/javascript-regex-to-match-a-url-in-a-field-of-text
	//and mod'd, mostly to not require a scheme
	//TODO: must also find local urls like "file:///C:/WebSites/ThoughtJotBasic/tj.html" - prefilter for that using another regex
	var parse_url = /((http|ftp|https):\/\/)?[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/g;
	var parse_file = /file:(\/){2,3}([A-Za-z]:\/)?[\w-\.\/]+/g;
	//var parse_file = /file:[\w-\.\/:]+/g;
	//var parse_url = /((http|ftp|https|file):(\/){2-3})?([A-Za-z]:\/)?[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/g;
	var parse_scheme = /((http|ftp|https|file):\/\/)?/;
	var allurls = [];
	var newlinks = [];
	var result = null;
	var linktext = "";
	// first find any url-ish strings
	while(result = parse_url.exec(text)) {
        allurls.push(result[0]);   // the url-ish string, must not change as we need below for the replace operation

        // add a scheme of http:// if there isn't one or we'll get the local page root tacked on and end up nowhere
        var proto = parse_scheme.exec(result[0]);
		if(proto === null || proto[0] === "")
		    linktext = "<a href='http://" + result[0] + "'> " + result[0] + " </a>";
		else  // add the http://
		    linktext = "<a href='" + result[0] + "'> " + result[0] + " </a>";
		
		newlinks.push(linktext);
	}
	// next any file-ish strings
	//TODO: this works BUT there can be collision between the two finders so that no matter what order one might find
	//      something that's really the others pervue. We might need to split the text up around things file finder gets
	//      and send those pieces to url finder then splice it all back together. A bit ugly but probably better for
	//      comprehensibility than trying to make an even more complex regex...
	/*while(result = parse_file.exec(text)) {
        allurls.push(result[0]);   // the url-ish string, must not change as we need below for the replace operation
	    linktext = "<a href='" + result[0] + "'> " + result[0] + " </a>";		
		newlinks.push(linktext);
	}*/
		
	// now replace the "links" we found in the jot - and possibly http-ized - with the real links we just made
	//TODO: this replace can cause problems if the same url string is in the jot text more than once - whether
	// or not one has a scheme prefix and the other doesn't ...
	for(var i = 0; i < allurls.length; i++) {
	    var zeta = text.replace(allurls[i], newlinks[i]);
		text = zeta;
	}

    // finally, deal with converting returns to <br /> elements
	// TODO: convert ws at front of newline to nbsps to wrap up our current minimal format-intention preservation
	var pieces = text.split('\n');
	if(pieces.length == 1)
	    return(text);
	// single returns will vanish, n>1 returns in a row lead to n-1 blank array elements
	var htmlized = "";
	for(var i = 0; i < pieces.length; i++) {
		if(pieces[i] === "")
		    htmlized = htmlized + "<br />";
		else if(i === pieces.length - 1)
		    htmlized = htmlized + pieces[i];
		else
		    htmlized = htmlized + pieces[i] + "<br />";
	}
	//alert(htmlized);
	return(htmlized);
}


