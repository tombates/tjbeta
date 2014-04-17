/*
* Core Thought Jot functionality file. The model and controller code really, mediating between the
* user actions in the html presentation view and the logic of persiting to local/remote stores.
*
* This file contains code for persisting information, conceptually rows of a table where each
* row represents a "jot" of text. These are displayed with a time stamp and edit and delete controls in the html.
* Each jot also has a title and a tags field. The jot, title and tags are editable. Only a single jot can be
* in the editable state at any given time.
*
* In this deprecated version, when a jot is created it is persisted both locally via explicit indexedDB code here,
* and remotely on Dropbox through the use of the NimbusBase API, which is a javascript package.
* 
* NimbusBase also uses the indexedDB feature of the browswer separately separately from Thought Jot, but clears that
* data when the session ends, leaving only the remote version. But the data saved via Thought Jot itself in the
* browser's indexedDB remains. This means there are two copies of the jot, one local and one remote.

* It must be noted that indexedDB storage is browser specific. For example, Firefox has no access to the indexedDB store
* of Chrome or IE. This means different jots could be entered via different browswers, and they will initially be stored
* together only remotely on Dropbox.
*
* When a page is refreshed or opened after again after a session has ended, two way syncing occurs in this version. This
* means that any locally stored jots not found remotely are pushed to the remote and any jots found remotely but not
* locally are pulled and added to the browswer's indexedDB store.
*
* For example if Firefox was used to create jotA and Chrome was used to make jotB, before refresh each browswer would show only
* one jot even though both have been persisted to the remote store. Upon a refresh however, any jots not in the local store
* would be pulled from the remote store and the browser's indexedDB would now contain both. In addition, if one browser was
* offline and jotC was created in it, the next time a refresh is done and the remote storage is available jotC would be pushed
* to the remote storage.
*
* The same goes for deletes and this can cause a weird problem of resurrecting deleted jots. Assume both browsers are
* synced with the remote store so that both have the same set of jots locally and this is the same as the remote set. Now
* in browser A we delete jotA. This deletes it from the remote store and browser A's indexedDB local store, but it does not
* delete if from browswer B's local store. So if browser B is now refreshed its local copy of jotA will be pushed to the
* remote store because it is seen to exist remotely but not locally, resurrecting jotA in browser A where we deleted it.
* Not pretty.
*
* This issue arises because in this version local and remote stores are given equal weight. This is the reason for the
* subsequent version which makes the remote store the canonical store. A later subsequent version might be made which allows
* for local store only if the user does not want to store jots remotely for privacy reasons. However it should be noted that
* that will not work if the user is using private browsing mode (Incognito in Chrome) as then the indexedDB functionality is
* disabled (and of course this would also disable NimbusBase).
*
* The application can be run either from a localhost rather than from a web server. However any jot content that is url
* based such as an image added to a jot, or a string representing a url (which Though Jot 'htlmizes' to make it a real link)
* will not be available. EXPAND ON THIS ISSUE.
*
*/

//TODO: a local only user option, requiring a new column if they want to mix modes so that local only jots are neither
//      seen by NimbusBase or ever pushed to a remote store.
//TODO: option for storing stuff on either (not both) GDrive and Dropbox

// Let's encapsulate our stuff in a namespace as object.
var tj = {};
tj.STORE_IDB = 1;
tj.STORE_DROPBOX = 2;
tj.STORE_GDRIVE = 4;
tj.STORE_BITTORRENT_SYNC = 8;
//tj.STORE_MASK = tj.STORE_IDB | tj.STORE_DROPBOX;   // Original but problematic mode
tj.STORE_MASK = tj.STORE_DROPBOX;   // TODO make user controlled

tj.jots = [];
tj.indexedDB = {};
tj.indexedDB.db = null;
tj.indexedDB.IDB_SCHEMA_VERSION = 7;
tj.indexedDB.order = "prev";   // default to showing newest jots at top

tj.indexedDB.onerror = function (e){
    console.log(e);
};

/*
* Opens a local indexedDB store for jots. Called only if tj.STORE_MASK has the tj.STORE_IDB flag on and only
* after opening the the NimbusBase connection to the remote store.
*/
tj.indexedDB.open = function() {
    "use strict";

    // Warn user that we do not support early versions of indexedDB
    if(!window.indexedDB) {    
    	window.alert("Your browser doesn't support a stable version of IndexedDB, which Thought Jot uses.\nSome features might not be available or might not work correctly.");
    }
    //TODO Get user's initial preferences for local and remote storage
    //TODO Get user's access info for their prefered remote storage locations - currently hard coded to my keys

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

    var htmlizedText = htmlizeText(jotText);
    if(htmlizedText === "") {
        alert("There is no jot content.");
        return;
    }
    var commonKey = new Date().getTime();
    var nbID = null;

	// add the jot to cloud storage location(s)
	if((tj.STORE_MASK & tj.STORE_DROPBOX) == tj.STORE_DROPBOX) {
        //nbx.Jots = Nimbus.Model.setup("Jots", ["commonKeyTS", "id", "time", "modTime", "title", "jot", "tagList", "extra", "isTodo", "done"]);
        //OLD nbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "time"]);
        console.log("addJot: attempting store of real jot on Dropbox");
        //var now = Date().toString();
        //NimbusBase populates the id field (specified in nb.js) automatically, then we get it and put it in the iDB record
        var tags = document.getElementById('add_tagsinput').value;
        if(tags === "" || tags === undefined)
            tags = "none";
        var title = document.getElementById('add_titleinput').value;
        if(title === "" || title === undefined)
            title = "untitled";

        var nrow = {"commonKeyTS":commonKey, "time":commonKey, "modTime":commonKey,
                    "title":title, "jot":htmlizedText, "tagList":tags, "extra":"none", "isTodo":false, "done":false};
        nbx.jotreal = nbx.Jots.create(nrow);
        nbID = nbx.jotreal.id;
        console.log("Nimbus instance count is now: " + nbx.Jots.count());
        console.log("addJot nbx.jotreal.id = " + nbID);
        console.log("addJot nbx.jotreal.time = " + nbx.jotreal.time);

        var idbRow = convertNimbusRowToIDBRow(nrow);
        var jotDiv = renderJot(idbRow);
        var jotsContainer = document.getElementById("jotItems");
        if(tj.indexedDB.order === "prev")  {   // newest are currently shown first
            var first = jotsContainer.firstChild;
            jotsContainer.insertBefore(jotDiv, jotsContainer.firstChild);
        }
        else {  // oldest are currently shown first
            jotsContainer.appendChild(jotDiv);
        }
    }

    //TODO refactor into sep function so can be used by addMissingLocalJots
	if((tj.STORE_MASK & tj.STORE_IDB) == tj.STORE_IDB) {
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
		    var jotDiv = renderJot(row);
		    var jotsContainer = document.getElementById("jotItems");

	        if(tj.indexedDB.order === "prev")  {   // newest are currently shown first
	        	var first = jotsContainer.firstChild;
	            jotsContainer.insertBefore(jotDiv, jotsContainer.firstChild);
	        }
	        else {  // oldest are currently shown first
                jotsContainer.appendChild(jotDiv);
            }
    	};
    	
    	request.onerror = function(e) {
    		console.log(e.value);
    	};
    }
};

/*
*   Clears all jots on the page and re-renders them. Used on open, reload, order toggling or filtering. Generally not
*   used just when a single jot is added or deleted or edited. In those cases we update the DOM directly.
*/
//PROBLEM we are showing all jots based on the local store. This is wrong. Consider having tj open in two browswers or
//two devices. Edit a jot in one and save the edit. The remote store now has the correct contents. BUT this function
//is calling renderJot with the local store data, which has not been updated with the edits.
//
// 1. we must check whether or not local version is out of date with remote version, not just whether it exists locally.
//    This is afterall why we added a modified time to the schema.
// 2. we should be calling renderJot with the remote versions if possible (only not possible if the connection to remote
//    is down). And if the connection is down we should warn the user that jots are being rendered only from the local
//    browswer specific store and therefore these might not have been synced with the remote store yet. A tricky situation
//    with no great solution. WHAT DOES NIMBUS DO ABOUT THIS?
//  OK this function is doing too much. It's supposed to showAllJots, but it's also doing the local/remote sync
//  thing, which gets very messy since this is asyncrhronous and the syncing will potentially fire off other async
//  update tasks, thus making it quite tricky to know when it's safe to actually get all the remote jots and use them
//  for rendering. Need to pull out most of this into a sep function - the first clue is that this function calls itself
//  and that just a recursion too far
//  WHAT'S MORE this isn't even sending to remote any jots that are only local, it is only gathering them up but in a
//  function scope var and then nothing is ever really done with that list (badly named pushToRemote). We should
//  push to remote at "we know we are connected" time and not so much here.
tj.indexedDB.showAllJots = function() {
	console.log("in showAllJots");
    if((tj.STORE_MASK & tj.STORE_IDB) == tj.STORE_IDB) {
        syncAllJots(pageRenderer);
    }
    else {
        pageRenderer();
    }
}

function pageRenderer() {
    var r = getSortedRemoteJots();
    var l = {};
    var nextJotDiv;
    //MUST convert from result.value to remote object -> local style

    // Currenly renderJot expects a local (indexedDB) style 'row' so we have to convert from the remote names
    // nbx.Jots = Nimbus.Model.setup("Jots", ["commonKeyTS", "id", "time", "modTime", "title", "jot", "tagList", "extra",
    //                               "isTodo", "done"]);

    var jotsContainer = document.getElementById("jotItems");
     jotsContainer.innerHTML = "";    // delete all the jotdivs as we are about to rereneder them all
    for(i = 0; i < r.length; i++) {
        l = convertNimbusRowToIDBRow(r[i]);
    	//l = {"commonKeyTS":r[i].commonKeyTS, "nimbusID":r[i].id, "nimbusTime":r[i].time, "modTime":r[i].modTime,
        //     "title":r[i].title, "jot":r[i].jot, "tagList":r[i].tagList, "extra":r[i].extra, "idTodo":r[i].isTodo, "done":r[i].done};
 	    nextJotDiv = renderJot(l);    // result.value is a basically a local store table row
	    jotsContainer.appendChild(nextJotDiv);   	
    }
}

//TODO remove once we are solid on the new scheme of mostly remote only
function convertNimbusRowToIDBRow(nrow) {
    var idb = {};
    idb = {"commonKeyTS":nrow.commonKeyTS, "nimbusID":nrow.id, "nimbusTime":nrow.time, "modTime":nrow.modTime,
           "title":nrow.title, "jot":nrow.jot, "tagList":nrow.tagList, "extra":nrow.extra, "idTodo":nrow.isTodo, "done":nrow.done};
    return idb;
}

function updateRemote(localNotOnRemote) {
	var l = localNotOnRemote;
    for(i = 0; i < localNotOnRemote.length; i++) {
    	// our input is in local format, we need to pull the values out
   	//var row = {"commonKeyTS":commonKey, "nimbusID":nbID, "nimbusTime":"none", "modTime":commonKey,
    //"title":"none", "jot": htmlizedText, "tagList":"none", "extra":"none", "isTodo":false, "done":false};

    // nbx.jotreal = nbx.Jots.create({"commonKeyTS":commonKey, "time":commonKey, "modTime":commonKey,
    //                                "title":"none", "jot":htmlizedText, "tagList":"none", "extra":"none", "isTodo":false, "done":false});
 
        var tostore = {"commonKeyTS":l[i].commonKeyTS, "time":l[i].commonKeyTS, "modTime":l[i].commonKeyTS,
            "title":l[i].title, "jot":l[i].jot, "tagList":l[i].tagList, "extra":l[i].extra, "isTodo":l[i].isTodo, "done":l[i].done};
        nbx.jotreal = nbx.Jots.create(tostore);
    }
}

function getSortedRemoteJots() {
    // get all the remote jots and sort them
    var remoteJots = nbx.Jots.all();
    var flip = (tj.indexedDB.order === "prev") ? -1 : 1;
    //PROBLEM how is this sorting on the commonKey? It's not.
    if(remoteJots.length > 0) {
    	remoteJots.sort(function(a,b) {
            return flip * (a.commonKeyTS - b.commonKeyTS);
    	});
    }

    return remoteJots;
}

function syncAllJots(pageRenderer) {
	var remoteJots = getSortedRemoteJots();
    var localJots = [];
    var pushToRemote = [];
	// get all the local jots and see if they all exist on the remote store(s)
	
	var db = tj.indexedDB.db;
	var trans = db.transaction(["Jots"], "readonly");
	trans.oncomplete = function(e) {
		console.log("showAllJots transaction.oncomplete() called");
		updateRemote(pushToRemote);    // push local jots not on remote: should be rare
		pageRenderer();
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
				    pullMissingRemoteJot(missingLocalVersions[i]);    // asynchronous!
				}
				tj.indexedDB.showAllJots();
			}
		    return;
		}

        // Deal with next row in the cursor and remember it if it is not stored remotely yet.
        // If the user has remote storage enabled there should typically be no cases of this.
		///var newJotDiv = renderJot(result.value);    // result.value is a basically a local store table row
		localJots.push(result.value);
		var sync = isLocalJotInRemoteStore(result.value, remoteJots);
		if(!sync) {
			pushToRemote.push(result.value);
		}

		//result.continue();    // compiler warning is bogus and due to 'continue' being a javascript keyword
		result['continue']();    // solution to warning, and for IE8 if we care
	};
	
	cursorRequest.onerror = tj.indexedDB.onerror;
};

/* Adds a jot that is on the remote store but not in our local indexedDB store to the local store. Most likely
*  the jot is not local because it was added via another device or browswer. Does not cause page redraw. It is
*  assumed that generally there will be several missing jots to add. Rather than try to insert each one in the
*  correct commonKey timestamp based location, a call to showAllJots should be made after all missing jots have
*  been added .
*/
function pullMissingRemoteJot(missing) {
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
	
	// a containing div for each jot
	var jdiv = document.createElement("div");
	jdiv.className = "jotdiv";
	// another div for the title, etc., which will remain when a jot is collapsed
	var titlediv = document.createElement("div");
	titlediv.className = "titlediv";
	// three divs for the left, center, and right columsn within the titlediv
	// these contain the edit link, the title/timestamp/tags editables, and the delete link
    var title_leftdiv = document.createElement("div");
    title_leftdiv.className = "titleleftdiv";
    var title_centerdiv = document.createElement("div");
    title_centerdiv.className = "titlecenterdiv";
    var title_rightdiv = document.createElement("div");
    title_rightdiv.className = "titlerightdiv";

	// spans for stuff in the title_centerdiv
	var titlespan = document.createElement("span");
	titlespan.className = "title";
    titlespan.innerHTML = "Title:";
    var titleinput = document.createElement("input");
    titleinput.setAttribute("type", "text");
    titleinput.setAttribute("maxlength", "150");
    titleinput.className = "titleinput";
	var timespan = document.createElement("span");
	timespan.className = "timestamp";
    // a paragraph for the tags, within the titlediv central column div
    var tagsspan = document.createElement("span");
    tagsspan.className = "tagsspan";
    tagsspan.innerHTML = "Tags:&nbsp;";
    var tagsinput = document.createElement("input");
    tagsinput.setAttribute("type", "text");
    tagsinput.setAttribute("maxlength", "200");
    tagsinput.className = "tagsinput";

	// a paragraph for the jot - simple for now: just one basic paragraph is all we handle
	var pjot = document.createElement("p");
	pjot.className = "jottext";

	var dellink = document.createElement("a");
	dellink.className = "delete";
	dellink.title = "Delete this jot"
	//dellink.textContent = " [Delete]";
	var delimage = document.createElement("img");
	delimage.src = ".\/images\/bin32.png"

	var editlink = document.createElement("a");
	editlink.className = "edit";
	editlink.title = "Edit this jot"
	//editlink.textContent = " [Edit]";
	var editimage = document.createElement("img");
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

    // ensure a jot being edited is displayed fully
    title_leftdiv.addEventListener("click", function(e){
        if(pjot.className == "jottext_collapsed")
            pjot.className = "jottext";
    });
    // set the display toggle handler
    title_centerdiv.addEventListener("click", function(e){
        console.log("Someone, or something, clicked on me!");
        //Note: we do nothing to pjot.classname if it is jottext_editing
        if(pjot.className == "jottext")
            pjot.className = "jottext_collapsed";
        else if(pjot.className == "jottext_collapsed")
            pjot.className = "jottext";
    });

	if(row.title == "none" || row.title == "" || row.title == undefined) {
		titleinput.value = "untitled";
	}
	else
	    titleinput.value = row.title;

	timespan.textContent = "created " + dt.toDateString() + " at " + dt.toLocaleTimeString();
	tagsinput.value = row.tagList;
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
	dellink.appendChild(delimage);
	
	editlink.addEventListener("click", function(e) {
		//tj.indexedDB.deleteJot(row.text);
		tj.indexedDB.editJot(this, row.commonKeyTS, pjot, titleinput, tagsinput);
	});
	editlink.appendChild(editimage);
	
	title_leftdiv.appendChild(editlink);
	titlediv.appendChild(title_leftdiv)
    titlespan.appendChild(titleinput);
	title_centerdiv.appendChild(titlespan);
	title_centerdiv.appendChild(timespan);
    tagsspan.appendChild(tagsinput);
    title_centerdiv.appendChild(tagsspan);
	titlediv.appendChild(title_centerdiv);
	title_rightdiv.appendChild(dellink);
	titlediv.appendChild(title_rightdiv);
	jdiv.appendChild(titlediv);
	//jdiv.appendChild(editlink);
	//jdiv.appendChild(dellink);
	jdiv.appendChild(pjot);
	return jdiv;
}

/*
* Makes the jot contenteditable if no jot currently is: only one jot can be editable at a time.
* If the jot is currently editable then it is set not editable and saves the current innerHTML.
* Changes the link image appropriately for the new state (edit or done), if any.
*
* editLink - The in-jot-div edit/save link (i.e. the pencil icon button) that received the click.
* commonKey - The commonKeyTS value for the jot, which links the different store's particular instances of the same jot.
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
tj.indexedDB.editJot = function(editLink, commonKey, jotElement, titleinput, tagsinput) {
    //console.log("tj.indexedDB.editJot()");
    var editimg = editLink.childNodes[0];
    if(tj.editing != null && editLink != tj.editing) {
    	alert("Only one jot can be edited at a time.");
    	return;
    }

    var newContent = jotElement.innerHTML;
    //var newTitle = titlespan.innerHTML;
    //var newTags = tagspara.innerHTML;
    if(newTitle == "" || newTitle == undefined)
    	newTitle = "untitled"

    if(editLink.title == "Edit this jot") {
        editLink.title = "Save the edit";
        editimg.src = ".\/images\/tick32.png";
	    jotElement.setAttribute("contenteditable", true);
	    jotElement.className = "jottext_editing";
	    //titlespan.setAttribute("contenteditable", true);
	    //titlespan.className = "title_editing";
        titleinput.className = "titleinput_editing"
        titleinput.disabled = false;
	    tagsinput.className = "tagsinput_editing";
        tagsinput.disabled = false;
        tj.editing = editLink;
    }
    else {    // time to save the edit

        //var newTitle = $(".title_editing").text();
        //var newTags = $(".tagspara_editing").text();
        var newTitle = titleinput.value;
        var newTags = tagsinput.value;

        if((tj.STORE_MASK & tj.STORE_IDB) == tj.STORE_IDB) {

    		var db = tj.indexedDB.db;
    		var trans = db.transaction(["Jots"], "readwrite");
    		trans.oncomplete = function(e) {
    			console.log("editJot transaction.oncomplete() called");
    		};
    		trans.onerror = function(e) {
    			console.log("editJot transaction.onerror() called");
    		}
    		var store = trans.objectStore("Jots");
            var request = store.get(commonKey);
            request.onerror = function(e) {
                console.log("editJot request.onerror() called");
            };
            request.onsuccess = function(e) {
                console.log("editJot request.onsuccess() called");

                var row = request.result;
                //row.text = jotElement.innerHTML;
                row.jot = newContent;
                row.title = newTitle;
                row.tagList = newTags;
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
        }
        //now we need to update the remote storage as well

	    if((tj.STORE_MASK & tj.STORE_DROPBOX) == tj.STORE_DROPBOX) {
	        //nbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "time"]);
	        console.log("editJot: updating Dropbox, except we aren't really yet!");

	        var nbJot = nbx.Jots.findByAttribute("commonKeyTS", commonKey);
	        nbJot.jot = newContent;
	        nbJot.title = newTitle;
	        nbJot.tagList = newTags;
	        nbJot.save();
	        nbx.Jots.sync_all(function() {console.log("tj.indexedDB.editJot nbx.Jots.sync_all() callback called.")});
	    }
 
        //TODO should we move this into the requestUpdate.onsuccess?
        //AND if there was an indexedDB error we should probably revert the page text...?
        editLink.title = "Edit this jot";
        editimg.src = ".\/images\/pen32.png";
	    jotElement.setAttribute("contenteditable", false);
        jotElement.className = "jottext";
	    //titlespan.setAttribute("contenteditable", false);
 	    //titlespan.className = "title";
        titleinput.disabled = true;
        titleinput.className = "titleinput";
	    tagsinput.disabled = true;
 	    tagsinput.className = "tagsinput";
        tj.editing = null;
        //var textcontent = jotElement.textContent;    // works on FF, Chrome NOT IE - looses markup AND NEWLINES! (which are markup really)
        //var wholecontent = jotElement.wholeText;
        //var innerttextcontent = jotElement.innerText;// works on Chrome, IE NOT FF - looses <a> markup and converts <b> to crlf apparently
        //var htmlcontent = jotElement.innerHTML;      // works on IE, FF, Chrome - retains the htmlization
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

/*
*  Deletes a jot from local and remote store(s).
*
*  commonKey - The commonKeyTS value for the jot, which links the different store's particular instances of the same jot.
*  jotDiv - The containing div of the jot, and its child div containing the title, tags, creation timestamp and
*  edit/delete controls.
*
*/
tj.indexedDB.deleteJot = function(commonKey, jotDiv) {

    if(commonKey === undefined) {
        removeJotDiv(jotDiv);
        return;
    }

	// delete the local indexedDB version of the jot
	if((tj.STORE_MASK & tj.STORE_IDB) == tj.STORE_IDB) {
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
		var request = store['delete'](commonKey);    // can't do store.delete(id) due to delete being a keyword, just like continue issue
		
		request.onsuccess = function(e) {
			removeJotDiv(jotDiv);
		};
		
		request.onerror = function(e) {
			console.log(e);
		};
    }

    // delete the Dropbox version
	if((tj.STORE_MASK & tj.STORE_DROPBOX) == tj.STORE_DROPBOX) {
	    var nbJot = nbx.Jots.findByAttribute("commonKeyTS", commonKey);
        nbJot.destroy();
        removeJotDiv(jotDiv);
    }
};

function removeJotDiv(jotDiv) {
	// delete the view of the jot by removing it's jotDiv - no more rerendering all the jot view's html!
    var jotsContainer = document.getElementById("jotItems");
    jotsContainer.removeChild(jotDiv);
}

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

// place selected tags in Tags text field for jot being added
function stageTags() {
    var tagSelector = document.getElementById('tagselector');
    var tags = [];
    var n = tagSelector.options.length;
    for(var i = 0; i < n; i++) {
        if(tagSelector.options[i].selected) {
            tags.push(tagSelector.options[i].value)
        }
    }
    var textfield = document.getElementById('add_tagsinput');
    textfield.value = tags.join(",");
}

// clear the Tags text field for jot being added
function clearStagedTags() {
    var textfield = document.getElementById('add_tagsinput');
    textfield.value = "";
}

// remove or add tags in Tags text field into the Tag Selector list
// a tag that does not exist in the list will be added, a tag prefixed
// with '-' that does exist in the list will be removed. This does not
// remove such tags from individual jot taglists that might have used
// the tags being removed. This means that these tags cannot be used
// as filters even though there might still be jots with the removed tags.
function mergeStagedTags() {
    console.log("mergeStagedTags() called");
    var tagsField = document.getElementById("add_tagsinput");
    var tagString = tagsField.value;
    tagManagerMerge(tagString);
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

/* Sets up the initial state of the Tag Selector UI list */
function tagManager_init() {
    console.log("tagManager_init()");
    tagManagerPopulateSelector();
}

/*
* Adds or removes tags from the master tag list maintained remotely via NimbusBase, and updates the UI
* select element on the page.
*
* mergeList - a list of tags to add or remove. This is a string of comma separated 'tag phrases' which
*             can contain white space (runs of spaces and tabs are collapsed to single spaces though).
*             Tags in the mergeList beginning with '-' indicate tags to be removed from the master
*             list. This means actual tags cannot begin with '-'. For tags not beginning with '-' the
*             tag is added to the master list if it is not already in it.
*
* Note: For now we do not search all jots for use of tags being removed from the master list. Since filtering
*       jots based on tags is based on the master tag list this means that filtering cannot be based on tags
*       that have been removed from the master list. Such orphan tags will still be in any jots they were applied
*       to and would have to be removed manually per jot (using the jot editing feature, which allows for title,
*       tags, and content editing). Alternatively the removed tag could be re-added to the master list and would
*       thus be an available filter target once again.
*/           
function tagManagerMerge(mergeList) {
    if(mergeList === undefined || mergeList == null || mergeList === "")
        return;
    var tagContainer = nbx.Tags.all();    // should be one or zero items, we need the inner list
    var existing = [];
    var stringOfTags;
    if(!(tagContainer === undefined || tagContainer === null || tagContainer.length === 0)) {
        stringOfTags = tagContainer[0].tagList;
        if(stringOfTags != undefined && stringOfTags != "")
            existing = stringOfTags.split(",");
    }

    // separate candidates into add and remove categories
    var mergeCands = mergeList.split(",");
    var mergeAdd = [];
    var mergeRemove = [];
    for(var i = 0; i < mergeCands.length; i++) {
        var trimmed = mergeCands[i].trim();
        if(trimmed.substr(0,1) == "-")
            mergeRemove.push(trimmed.substr(1, trimmed.length - 1));
        else
            mergeAdd.push(trimmed);
    }
    // do removals first
    var existingMinusRemoved = [];
    if(existing.length != 0) {    // if no existing tags then there's nothing to remove
        for(var i = 0; i < existing.length; i++) {
            for(var j = 0; j < mergeRemove.length; j++) {
                if(existing[i].toLowerCase() === mergeRemove[j].toLowerCase())
                {
                    existing[i] = null;
                    break;
                }
            }
            if(existing[i] != null)      
                existingMinusRemoved.push(existing[i]);
        }
    }
    // now additions and sort
    for(var i = 0; i < mergeAdd.length; i++) {
        if(existingMinusRemoved.indexOf(mergeAdd[i]) == -1)
            existingMinusRemoved.push(mergeAdd[i]);
    }
    existingMinusRemoved.sort();

    // update the remote tag list, which might be empty or non-existent
    var tags = existingMinusRemoved.join();
    var taglist = {"tagList":tags, "extra":"none"};
    var tagsRemote = nbx.Tags.all();
    if(tagsRemote === undefined || tagsRemote.length == 0) {
        nbx.Tags.create({tagList:tags, "extra":""})
    }
    else {
        tagsRemote[0].tagList = tags;
        tagsRemote[0].save();
        nbx.Tags.sync_all(function() {console.log("tagManagerMerge() nbx.Tags.sync_all() callback called.")});
    }
    // update the page's Tag Selector select element
    tagManagerPopulateSelector(existingMinusRemoved);
}

/*
* Populates the Tag Selector list select element on the page with the tags stored on the remote.
*
* fromList - optional argument. If present fromList should be the definitive tags list as an
*            array of strings. If fromList is undefined we will populate using the remote list.
*/
function tagManagerPopulateSelector(fromList) {
    //var allTags = [];
    //var tagList = fromList;
    var selector = document.getElementById('tagselector');
    if(fromList === undefined) {   // meaning pull from remote
        var tagContainer = nbx.Tags.all();    // should be one or zero items, we need the inner array
        if(tagContainer === undefined || tagContainer === null || tagContainer.length === 0)
            return null;
        fromList = tagContainer[0].tagList.split(",");
    }
    //else
    //    allTags = fromList.split(",");
    //allTags = tagList.split(",");
    // now add however many of these: <option value="tagX">tagX</option>
    selector.innerHTML = "";
    for(var i = 0; i < fromList.length; i++) {
        var newItem = document.createElement("option");
        newItem.setAttribute("value", fromList[i]);
        newItem.innerHTML = fromList[i];
        selector.appendChild(newItem);
    }
}

/*
* Helper function that lets user's carriage returns shine through.
*   Very simple for now: we just replace n returns with with n <br />
*   elements. We do not yet create actual separate html paragraphs.
*
*   Also attempts to recognize urls and wrap them in <a></a> to make
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
