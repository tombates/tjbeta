/*
* Core Thought Jot functionality file. The model and controller code really, mediating between the
* user actions in the html presentation view and the logic of persiting to remote stores.
*
* This file contains code for persisting information, conceptually rows of a table where each
* row represents a "jot" of text. These are displayed with a time stamp and edit and delete controls in the html.
* Each jot also has a title and a tags field. The jot, title and tags are editable. Only a single jot can be
* in the editable state at any given time.
*
* When a jot is created it is persisted remotely on Dropbox or Google Drive through the use of the
* NimbusBase (www.nimbusbase.com) API, which is a javascript package.
*
* Thought Jot itself uses local storage (indexedDB) to store user filter state information so that when the user
* returns (to the same browser on the same device) they will again see only the jots matching their previous filter
* criteria.
* 
* NimbusBase also uses the indexedDB feature of the browser separately from Thought Jot, but clears that
* data when the session ends, leaving only the remote version.

* It must be noted that indexedDB storage is browser specific. For example, Firefox has no access to the indexedDB store
* of Chrome or IE. This means different jots could be entered via different browsers and/or devices, and unless a refresh
* was done with no filtering jots entered via other browsers/devices might not show up.
*
* It should be noted that indexedDB is not available in private browsing mode (Incognito in Chrome) and this will disable
* filter state saving and NimbusBase. In other words the current version cannot work in private browsing mode.
*
* IS THIS EVEN TRUE: EXPAND ON THIS ISSUE OR DELETE.The application can be run either from a localhost rather than from a web server. However any jot content that is url
* based such as an image added to a jot, or a string representing a url (which Though Jot 'htlmizes' to make it a real link)
* will not be available.
*
*/

//TODO: a local only user option, requiring a new column if they want to mix modes so that local only jots are neither
//      seen by NimbusBase or ever pushed to a remote store.
//TODO: option for storing stuff on either (not both) GDrive and Dropbox

// Let's encapsulate our stuff in a namespace as object.
var tj = {};
tj.STORE_DROPBOX = 2;
tj.STORE_GDRIVE = 4;
tj.STORE_BITTORRENT_SYNC = 8;

//The value returned by the getTime method is the number of milliseconds since 1 January 1970 00:00:00 UTC.
tj.MS_ONE_DAY = 86400000;    // milliseconds in one day = 24 * 60 * 60 * 1000

//tj.STORE_MASK = tj.STORE_IDB | tj.STORE_DROPBOX;   // Original but problematic mode
tj.STORE_MASK = tj.STORE_DROPBOX;   // TODO make user controlled

tj.jots = [];
tj.indexedDB = {};
tj.filterObject = {};
tj.indexedDB.db = null;
tj.indexedDB.IDB_SCHEMA_VERSION = 10;

tj.SERVICE_UNKNOWN = -1;
tj.SERVICE_DROPBOX = 1;
tj.SERVICE_GOOGLE = 2;
tj.service = tj.SERVICE_DROPBOX;
///tj.key = "";
///tj.secret = "";

tj.status = {};   // holds the status area information
tj.status.prefix = "Showing ";
tj.status.total = 0;
tj.status.subset = 0;
tj.status.filterDatesPrefix = "";
tj.status.filterDatesText = "";
tj.status.filterTagsPrefix = "";
tj.status.filterTagsText = "";

tj.filterObject.filterTags = null;
tj.filterObject.filterOnTags = false;     // the checkbox state
tj.filterObject.filterOnTagsOr = false;   // radio btn state
tj.filterObject.filterOnTagsAnd = false;  // radio btn state
tj.filterObject.filterOnDate = false;     // the checkbox state
tj.filterObject.startDate = "";
tj.filterObject.endDate = "";
tj.filterObject.filterOrder = "newfirst"; // default ordering

tagMgr = {};    // encapsulates tag management functions

//window.addEventListener("DOMContentLoaded", tj.indexedDB.open, false);
/* Save session state data locally so that tag selection and filtering can be restored to their previous
*  state. Because this uses indexedDB it is per browser brand and per device, meaning one could have different
*  filters going on the same Jot remote storage data, which is kind of cool. 
*/

tj.indexedDB.onerror = function (e){
    console.log(e);
};

/*
* Opens a local indexedDB store used for persisting session filter settings.
* Here we retrieve any previously saved filter settings and the authorization data for the
* user's remote storage service before calling NimbusBase library functions for remote retrieval.
*/
tj.indexedDB.open = function() {
    "use strict";

    // Warn user that we do not support early versions of indexedDB
    if(!window.indexedDB) {    
        window.alert("Your browser doesn't support a stable version of IndexedDB, which Thought Jot uses.\n" +
                     "You also cannot use Thought Jot in private browsing mode, as this\n" +
                     "disables a browser's IndexedDB support.");
    }

    tj.bindControls();

    var openRequest = indexedDB.open("ThoughtJot", tj.indexedDB.IDB_SCHEMA_VERSION);  // returns an IDBOpenDBRequest object
	// see https://developer.mozilla.org/en-US/docs/IndexedDB/Using_IndexedDB
    openRequest.onupgradeneeded = function(e) {
		var db = e.target.result;
		console.log("tj.indexedDB.open: in request.onupgradeneeded() callback");
		// A versionchange transaction is started automatically.
		e.target.transaction.onerror = tj.indexedDB.onerror;
		if(db.objectStoreNames.contains("SessionState")) {
			db.deleteObjectStore("SessionState");
		}		
		var store = db.createObjectStore("SessionState", {keyPath: "name"});
	};
	
    // populate the filterObject with the locally saved filter state
	openRequest.onsuccess = function(e) {
		console.log("retrieving filter state: in request.onsuccess() callback");
		tj.indexedDB.db = e.target.result;

        // restore the saved session filter state data, if any

        var trans = tj.indexedDB.db.transaction(["SessionState"]);
        trans.oncomplete = function(e) {
            console.log("retrieving filter state: trans.oncomplete() called");
        }
        trans.onerror = function(e) {
            console.log("retrieving filter state: trans.onerror() called");
            console.log(trans.error);
        }

        var store = trans.objectStore("SessionState");
        var fsRequest = store.get("filterState");
                
        fsRequest.onsuccess = function(e) {
            if(fsRequest.result == undefined) {
                console.log("undefined retrieved filterState state in: request.onsuccess() called");
                tj.filterObject.filterTags = null;
                tj.filterObject.startDate = "";
                tj.filterObject.endDate = "";
                tj.filterObject.filterOnTags = false;
                tj.filterObject.filterOnTagsOr = false;
                tj.filterObject.filterOnTagsAnd = false;
                tj.filterObject.filterOnDate = false;
                tj.filterObject.filterOrder = "newfirst";
            }
            else {
                console.log("defined retrieved filterState state in: request.onsuccess() called");
                tj.filterObject.filterTags = fsRequest.result.filterTags;
                tj.filterObject.startDate = fsRequest.result.startDate;
                tj.filterObject.endDate = fsRequest.result.endDate;
                tj.filterObject.filterOnTags = fsRequest.result.filterOnTags;
                tj.filterObject.filterOnTagsOr = fsRequest.result.filterOnTagsOr;
                tj.filterObject.filterOnTagsAnd = fsRequest.result.filterOnTagsAnd;
                tj.filterObject.filterOnDate = fsRequest.result.filterOnDate;
                tj.filterObject.filterOrder = fsRequest.result.filterOrder;
            }

            Nimbus.Auth.setup(nbx.sync_object);
            nbx.auth = Nimbus.Auth.authorized();
            if(nbx.auth === false) {
                console.log("tj.indexedDB.open Nimbus.Auth.authorized() is FALSE");
                nbx.userConnectRequest("Dropbox");
            }
            else {
                console.log("tj.indexedDB.open Nimbus.Auth.authorized() is TRUE");
                nbx.open();
            }
        };
        
        fsRequest.onerror = function(e) {
            console.log(e.value);
        };
	};
	
	openRequest.onerror = tj.indexedDB.onerror;
};

tj.bindControls = function() {
    // bind CTL-s for saving edits to a jot - would also work to use window.addEventListener( instead w/o jQuery)
    $(window).bind('keydown', function(event) {
        if (event.ctrlKey || event.metaKey) {
            switch (String.fromCharCode(event.which).toLowerCase()) {
            case 's':
                event.preventDefault();
                console.log('ctrl-s');
                // We don't use jQuery trigger because we don't have a sep id for each edit link so we can't
                // use a jQuery selector to get at the right link. But we already have the link itself in hand in
                // tj.editing so we use a more direct method. But this has its own issues as FF does not
                // support click, and IE apparently does not fully support CustomEvent which is the supposed
                // replacement for the deprecated createEvent WHICH DOES WORK in IE, FF and Chrome. Ugh.

                // if there is a jot being edited, simulate user clicking check (save) button in the jot
                //if(tj.editing !== null) {
                //    tj.editing.click();  // works in Chrome and IE but not FF
                //}
                // But this works in IE, FF and Chrome:
                var evt = document.createEvent('MouseEvents');   // ugh createEvent is deprecated, see above
                evt.initEvent(
                    'click',   // event type
                    false,      // can bubble?
                    true       // cancelable?
                );
                tj.editing.dispatchEvent(evt);
                break;
            }
        }
    });

    // bind JQuery UI date pickers to the end/start date filter fields
    $("#startdate").datepicker();
    $("#enddate").datepicker();

    // create and bind settings/help dialogs
    $( "#helpDialog" ).dialog({
      autoOpen: false,
      show: {
        effect: "fade",
        duration: 500
      },
      hide: {
        effect: "fade",
        duration: 500
      }
    });
 
    $( "#helpOpener" ).click(function() {
      console.log("in helpOpen click handler");
      $( "#helpDialog" ).dialog( "option", "width", 800 );
      $( "#helpDialog" ).dialog( "open" );
    });

    $( "#settingsDialog" ).dialog({
      autoOpen: false,
      show: {
        effect: "fade",
        duration: 500
      },
      hide: {
        effect: "fade",
        duration: 500
      }
    });

    $( "#settingsOpener" ).click(function() {
      console.log("in settingsOpener click handler");
      $( "#settingsDialog" ).dialog( "option", "width", 600 );
      $( "#settingsDialog" ).dialog( "open" );
    });
}

/* Wrapper for innerAddJot. */
tj.addJot = function() {
    var jotComposeArea = document.getElementById('jot_composer');
    tj.innerAddJot(jotComposeArea.value);    
    jotComposeArea.value = '';    // clear the compose area of the input text
}

/* Adds a jot to the remote store.
*
*  jotText - the contents (value) of the jot composition area.
*/
tj.innerAddJot = function(jotText) {
	//TODO since we are saving to multiple places we need to check for errors back from each store location
	//     and recover/report

    var htmlizedText = tj.htmlizeText(jotText);
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
        console.log("addJot: storing jot on Dropbox");
        //var now = Date().toString();
        //NimbusBase populates the id field (specified in nb.js) automatically, then we get it and put it in the iDB record
        var tags = document.getElementById('add_tagsinput').value;
        if(tags === undefined || tags === "")
            tags = "none";
        var titleField = document.getElementById('add_titleinput');
        var title = titleField.value;
        if(title === undefined || title === "")
            title = "untitled";

        var nrow = {"commonKeyTS":commonKey, "time":commonKey, "modTime":commonKey,
                    "title":title, "jot":htmlizedText, "tagList":tags, "extra":"none", "isTodo":false, "done":false};
        nbx.jotreal = nbx.Jots.create(nrow);
        nbID = nbx.jotreal.id;
        console.log("Nimbus instance count is now: " + nbx.Jots.count());
        console.log("addJot nbx.jotreal.id = " + nbID);
        console.log("addJot nbx.jotreal.time = " + nbx.jotreal.time);

        var idbRow = convertNimbusRowToIDBRow(nrow);
        var jotDiv = tj.renderJot(idbRow);
        var jotsContainer = document.getElementById("jotItems");
        if(tj.filterObject.filterOrder === "newfirst")  {   // newest are currently shown first
            var first = jotsContainer.firstChild;
            jotsContainer.insertBefore(jotDiv, jotsContainer.firstChild);
        }
        else {  // oldest are currently shown first
            jotsContainer.appendChild(jotDiv);
        }

        // clear the Title field
        titleField.value = "";
    }
};

/*
*   Clears all jots on the page and re-renders them. Used on open, reload, order toggling or filtering. Generally not
*   used just when a single jot is added or deleted or edited. In those cases we update the DOM directly.
*/
tj.indexedDB.showAllJots = function(filterObject) {
	console.log("in showAllJots");
    pageRenderer(filterObject);
}

function pageRenderer(filterObject) {
    //var end_time = new Date().getTime();
    var r = getSortedRemoteJots(filterObject);
    //var duration = end_time - start_time;
    //console.log("pageRender getSortedRemoteJots took:" + duration + "milliseconds")

    var l = {};
    var nextJotDiv;
    //MUST convert from result.value to remote object -> local style

    // Currenly renderJot expects a local (indexedDB) style 'row' so we have to convert from the remote names
    // nbx.Jots = Nimbus.Model.setup("Jots", ["commonKeyTS", "id", "time", "modTime", "title", "jot", "tagList", "extra",
    //                               "isTodo", "done"]);
    var statusReport = getStatusReport();
    ///var status = document.getElementById("statusarea");
    ///status.innerHTML = statusReport;
    document.getElementById("statusarea").innerHTML = statusReport;

    // PERFORMANCE change to using Fragment in order to minimize touching the live DOM for each jotdiv
    // let's gather some timing info to see if this noticeably improves things

    var jotsContainer = document.getElementById("jotItems");
    //start_time = new Date().getTime();
    jotsContainer.innerHTML = "";    // delete all the jotdivs as we are about to rereneder them all

    // just started pagination, which is complicated by not begin able to much useful with the remote store
    // except all(). weird this is first and last but no range or finer getbyattribute methods in NimbusBase
    // makes it hard to make anything very scalable...
    //var startat = 0;
    //var stopat = r.length > startat + 10 ? startat + 10 : r.length;
    var fragment = document.createDocumentFragment();
    for(i = 0; i < r.length; i++) {
        l = convertNimbusRowToIDBRow(r[i]);
    	//l = {"commonKeyTS":r[i].commonKeyTS, "nimbusID":r[i].id, "nimbusTime":r[i].time, "modTime":r[i].modTime,
        //     "title":r[i].title, "jot":r[i].jot, "tagList":r[i].tagList, "extra":r[i].extra, "idTodo":r[i].isTodo, "done":r[i].done};
 	    nextJotDiv = tj.renderJot(l);    // result.value is a basically a local store table row
        //jotsContainer.appendChild(nextJotDiv);      
        fragment.appendChild(nextJotDiv);      
    }
    jotsContainer.appendChild(fragment);      
    //end_time = new Date().getTime();
    //duration = end_time - start_time;
    //console.log("pageRender jots render and append took:" + duration + "milliseconds")
};

/* Returns a string describing the current list of jots shown and the filtering that led to that list. */
function getStatusReport() {
    var pieces = [tj.status.prefix];
    var tagparts = [];
    // TODO what about using arrays for the string bits then join to get the final status report - might be less ugly

    if(tj.status.total === tj.status.subset) {
        pieces.push("all jots (" + tj.status.total.toString() + ")");
    }
    else {    // create string rep of date and tag filters
        pieces.push(tj.status.subset.toString() + " of " + tj.status.total.toString());        
        pieces.push(", filtered by");


        if(tj.filterObject.filterOnTags && (tj.filterObject.filterOnTagsOr || tj.filterObject.filterOnTagsAnd)) {
            if(tj.filterObject.filterTags.length > 1) {
                if(tj.filterObject.filterOnTagsOr)
                    tagparts.push("tags (OR'd): ");
                else if(tj.filterObject.filterOnTagsAnd)
                    tagparts.push("tags (AND'd): ");
            }
            else if(tj.filterObject.filterTags.length === 1){
                tagparts.push("tag");
            }
            
            tagparts.push(tj.filterObject.filterTags.join(", "));
        }

        //TODO validate that we have valid date strings or don't do date part
        if(tj.filterObject.filterOnDate) {
            pieces.push("date range: " + tj.filterObject.startDate + " - " + tj.filterObject.endDate);
            if(tagparts.length > 0)
                pieces.push("and by");
        }
        pieces.push(tagparts.join(" "))
    }
    return pieces.join(" ");
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

/*
* Returns an array of jots in the correct newest/oldest order, and possibly restricted to a certain set of tags.
*
* filterObject - An optional object containing an array of tags, filterMode, and date range information.
*/
function getSortedRemoteJots(filterObject) {
    // get all the remote jots and sort them
    var remoteJots = nbx.Jots.all();
    tj.status.total = remoteJots.length;
    var flip = (tj.filterObject.filterOrder === "newfirst") ? -1 : 1;

    if(filterObject !== undefined) {
        console.log("getSortedRemoteJots filterObject is DEFINED");
        var filteredJots = [];
        //var tagChecking = ((filterObject.filterMode & tj.FILTERMODE_TAGS) == tj.FILTERMODE_TAGS);
        var tagChecking = filterObject.filterOnTags;
        var dateChecking = filterObject.filterOnDate;

        // If the user is filtering on both tags and date range we take this as an AND operation: a displayed
        // jot must be in the date range AND must be tagged with the tags (Which might be AND or OR mode).
        var dateHit;
        for(var i = 0; i < remoteJots.length; i++) {
            var jot = remoteJots[i];
            if(dateChecking) {
                dateHit = inDateRange(jot, filterObject);
                if(dateHit === undefined)   // bogus date string(s) so default to showing all
                    return remoteJots;
                if(dateHit) {
                    if(tagChecking) {
                        if(containsTags(jot, filterObject)) {
                            filteredJots.push(jot);   // date and tag filtering
                        }
                    }
                    else    // only date filtering
                        filteredJots.push(jot);
                }
            }
            else if(tagChecking && containsTags(jot, filterObject)) {
                filteredJots.push(jot);    // only tag filtering
            }
        }
        remoteJots = filteredJots;
    }
    else {
        console.log("getSortedRemoteJots filterObject is UNDefined");        
    }

    if(remoteJots.length > 0) {
    	remoteJots.sort(function(a,b) {
            return flip * (a.commonKeyTS - b.commonKeyTS);
    	});
    }
    tj.status.subset = remoteJots.length;
    return remoteJots;
}

/* Returns true if a jot's create date is in the date filter range currently specified, false otherwise. */
function inDateRange(jot, filterObject) {
    // we need to translate from the timestamp in the jot to the date strings we have from the filter options UI
    var target = jot.commonKeyTS;
    var start = document.getElementById("startdate").value;
    tj.filterObject.startDate = start;
    var end = document.getElementById("enddate").value;
    tj.filterObject.endDate = end;
    start = (new Date(start).getTime());
    end = (new Date(end).getTime()) + (tj.MS_ONE_DAY - 1);  // adjust to get the whole day for the end date

    // deal with bogus or missing dates
    if(isNaN(start) && isNaN(end)) {
        alert("Please specify at least one valid date.\n\n If only one date is given it will be\n used for both end and start.")
        return undefined;
    }
    if(isNaN(start))
        start = end - (tj.MS_ONE_DAY - 1);
    else if(isNaN(end))
        end = start + (tj.MS_ONE_DAY - 1);

    // finally, the real test
    if((target >= start) && (target <= end))
        return true;
    else
        return false;
}

/* Returns if a jot meets the current tag filter criteria, false otherwise. */
function containsTags(jot, filterObject) {
    if(jot.tagList == undefined || jot.tagList === null || jot.tagList == "none") {
        return false;
    }

    var tagsInJot = jot.tagList.split(/,\s*/);
    var present = -1;
    for(var i = 0; i < filterObject.filterTags.length; i++) {

        present = tagsInJot.indexOf(filterObject.filterTags[i]);
        if(filterObject.filterOnTagsOr) {
            if(present != -1)
                return true;
            if(i == filterObject.filterTags.length - 1)
                return false;
        }
        else if(filterObject.filterOnTagsAnd) {
            if(present == -1)
                return false;
        }
    }
    return true;
}

/*
* Creates all the HTML elements for a single jot and sets them into a new div ready to be added to the
* all-jots-div. The caller is reponsible for adding the retuned div to the jotItems div.
*
* row - An array containing the "column" entries for a particular jot.
*/
tj.renderJot = function(row) {	
	
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
    titlespan.innerHTML = "Title: ";
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
	delimage.src = ".\/images\/delete-20h.png"

	var editlink = document.createElement("a");
	editlink.className = "edit";
	editlink.title = "Edit this jot"
	//editlink.textContent = " [Edit]";
	var editimage = document.createElement("img");
	editimage.src = ".\/images\/pen-20h.png"
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

	var dt = new Date(row.commonKeyTS);   // get a Date obj back so we can call some presentation methods
	
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
	pjot.innerHTML = row.jot;
	// wire up Delete link handler and pass the inner deleteJot the keyPath and jotdiv it will need
	dellink.addEventListener("click", function(e) {
		var yesno = confirm("Are you sure you want to delete this jot?\n\nThis is not undoable.");
		if(yesno) {
		    tj.deleteJot(row.commonKeyTS, jdiv);
        }
	});    
	dellink.appendChild(delimage);
	
	editlink.addEventListener("click", function(e) {
		tj.editJot(this, row.commonKeyTS, pjot, titleinput, tagsinput);
	});
	editlink.appendChild(editimage);
	
	title_leftdiv.appendChild(editlink);
	titlediv.appendChild(title_leftdiv)

    titlespan.appendChild(titleinput);
	title_centerdiv.appendChild(titlespan);
    tagsspan.appendChild(tagsinput);
    title_centerdiv.appendChild(tagsspan);
	title_centerdiv.appendChild(timespan);

	titlediv.appendChild(title_centerdiv);
	title_rightdiv.appendChild(dellink);
	titlediv.appendChild(title_rightdiv);
	jdiv.appendChild(titlediv);
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
tj.editJot = function(editLink, commonKey, jotElement, titleinput, tagsinput) {
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
        editimg.src = ".\/images\/editdone-20h.png";
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

	    if((tj.STORE_MASK & tj.STORE_DROPBOX) == tj.STORE_DROPBOX) {
	        console.log("editJot: updating Dropbox.");

	        var nbJot = nbx.Jots.findByAttribute("commonKeyTS", commonKey);
	        nbJot.jot = newContent;
	        nbJot.title = newTitle;
	        nbJot.tagList = newTags;
	        nbJot.save();
	        nbx.Jots.sync_all(function() {console.log("tj.editJot nbx.Jots.sync_all() callback called.")});
	    }
 
        //TODO should we move this into the requestUpdate.onsuccess?
        //AND if there was an indexedDB error we should probably revert the page text...?
        editLink.title = "Edit this jot";
        editimg.src = ".\/images\/pen-20h.png";
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
tj.deleteJot = function(commonKey, jotDiv) {

    if(commonKey === undefined) {
        tj.removeJotDiv(jotDiv);
        return;
    }

    // delete the Dropbox version
	if((tj.STORE_MASK & tj.STORE_DROPBOX) == tj.STORE_DROPBOX) {
	    var nbJot = nbx.Jots.findByAttribute("commonKeyTS", commonKey);
        nbJot.destroy();
        tj.removeJotDiv(jotDiv);
    }
};

tj.removeJotDiv = function(jotDiv) {
	// delete the view of the jot by removing it's jotDiv - no more rerendering all the jot view's html!
    var jotsContainer = document.getElementById("jotItems");
    jotsContainer.removeChild(jotDiv);
}

function indexedDB_init() {
	console.log("doing indexedDB init()");
	tj.indexedDB.open();  // shows any data previously stored
}

//
// Our action handlers for sort order, date range, etc.
//

/* Toggles the temporal sort order of displayed jots. */
tj.toggleOrdering = function() {
	var toggle = document.getElementById('toggleOrder');
	if(tj.filterObject.filterOrder === "newfirst") {
		toggle.title = "Press to show newest jots first.";
		tj.filterObject.filterOrder = "oldfirst";
	}
	else {
		toggle.title = "Press to show oldest jots first.";
		tj.filterObject.filterOrder = "newfirst";
	}
    tj.showFilteredJots();
}

//TODO not yet implemented
tj.paginator = function(direction) {
    console.log("tj.paginator() with direction " + direction);
}

tj.raiseCalendar = function(elementID) {
    var which = "#" + elementID;
    $(which).datepicker();
}

/* Sets up the initial state of the Tag Selector UI list */
tj.restoreTagSelectorState = function() {
    tj.filtersClear();
    tagMgr.populateSelector();
}

/* For some reason Firefox is remembering checkbox and radio states across reloads -- weird.
*  So we explicitly clear them before getting the saved filter settings, as ugly as that is. */
tj.filtersClear = function() {
     document.getElementById("filter_by_date").checked = false;
     document.getElementById("filter_by_tags").checked = false;
}

/* Sets the state of tj.filterObject into the UI controls, typically at page load time. */
//TODO all this checking and unchecking should be done in a fragment to minimize reflow
tj.restoreFilterControlsState = function() {
    // select the tags that were previously selected in the tag selector list
    tagMgr.selectTags(tj.filterObject.filterTags);

    // now restore the state of the filter mode controls
    if(tj.filterObject.filterOnTags) {
        document.getElementById("filter_by_tags").checked = true;
    }
    else {
        document.getElementById("filter_by_tags").checked = false;
    }
    tj.toggleTagFilter();

    if(tj.filterObject.filterOnTagsOr) {
        document.getElementById("filter_by_tags_or").checked = true;
    }
    else {
        document.getElementById("filter_by_tags_or").checked = false;
    }

    if(tj.filterObject.filterOnTagsAnd) {
        document.getElementById("filter_by_tags_and").checked = true;
    }
    else {
        document.getElementById("filter_by_tags_and").checked = false;
    }

    if(tj.filterObject.filterOnDate)
        document.getElementById("filter_by_date").checked = true;
    else
        document.getElementById("filter_by_date").checked = false;
    document.getElementById("startdate").value = tj.filterObject.startDate;
    document.getElementById("enddate").value = tj.filterObject.endDate;
    tj.toggleDateFilter();
}

/* Gathers currently selected and staged tags, and any filter state
*  and persists them for the next session using this browser on this device. */
tj.indexedDB.persistFilterControlsState = function() {

        var db = tj.indexedDB.db;
        var trans = db.transaction(["SessionState"], "readwrite");
        trans.oncomplete = function(e) {
            console.log("storing session state trans.oncomplete() called");
        }
        trans.onerror = function(e) {
            console.log("storing session state trans.onerror() called");
            console.log(trans.error);
        }
        // IndexedDB on client side new schema 3-22-2014:
        // {keyPath: "commonKeyTS"}, "nimbusID", nimbusTime, modTime, title, jot", "tagList", "extra", isTodo", "done", 
        var store = trans.objectStore("SessionState");
        var row = {"name":"filterState", "filterMode":tj.filterObject.filterMode,
                   "filterOnTags":tj.filterObject.filterOnTags,
                   "filterOnTagsOr":tj.filterObject.filterOnTagsOr,
                   "filterOnTagsAnd":tj.filterObject.filterOnTagsAnd,
                   "filterTags":tj.filterObject.filterTags,
                   "filterOnDate":tj.filterObject.filterOnDate,
                   "startDate":tj.filterObject.startDate, "endDate":tj.filterObject.endDate,
                   "filterOrder":tj.filterObject.filterOrder};
        var request = store.put(row);  // for now at least there is only one persisted filterObject
                
        request.onsuccess = function(e) {
            console.log("storing session state request.onsuccess");
        };
        
        request.onerror = function(e) {
            console.log(e);
        };
};

/* Handler for by date checkbox. */
tj.toggleDateFilter = function() {
    var dateCheckbox = document.getElementById("filter_by_date").checked;
    var filterDateDiv = document.getElementById("filter_date_div");
    if(dateCheckbox) {
        filterDateDiv.className = "display_block";
    }
    else {
        filterDateDiv.className = "display_none";
    }
    tj.filterObject.filterOnDate = dateCheckbox;
}

/* Handler for by tags checkbox. */
tj.toggleTagFilter = function() {
    var tagCheckbox = document.getElementById("filter_by_tags").checked;
    var filterTagDiv = document.getElementById("filter_tag_div");
    if(tagCheckbox) {
        filterTagDiv.className = "display_block";
        //tj.filterObject.filterMode |= tj.FILTERMODE_TAGS;
        tj.filterObject.filterOnTags = true;
    }
    else {
        filterTagDiv.className = "display_none";
        //tj.filterObject.filterMode &= ~(tj.FILTERMODE_TAGS);
        tj.filterObject.filterOnTags = false;
    }
}


/* Handler for the Filter button. Sets the state of tj.filterObject accordingly and
*  and calls showAllJots, using the filterObject if any filtering is to be done. */
tj.showFilteredJots = function() {
    tj.filterObject.filterTags = tagMgr.getSelectedTags();
    // if no filtering show everything
    //if(!(document.getElementById("filter_by_tags_or").checked
    //    || document.getElementById("filter_by_tags_and").checked || document.getElementById("filter_by_date").checked)) {
    if(!(document.getElementById("filter_by_date").checked || document.getElementById("filter_by_tags").checked)) {
        tj.indexedDB.showAllJots();
    }
    else {  // record radio buttons state separately so user can turn tag filter on/off while keeping or/and state
        if(document.getElementById("filter_by_tags_or").checked) {
            //tj.filterObject.filterMode |= tj.FILTERMODE_TAGS_OR;       
            tj.filterObject.filterOnTagsOr = true;     
        }
        else {
            //tj.filterObject.filterMode &= ~(tj.FILTERMODE_TAGS_OR);       
            tj.filterObject.filterOnTagsOr = false;       
        }
        if(document.getElementById("filter_by_tags_and").checked) {
            //tj.filterObject.filterMode |= tj.FILTERMODE_TAGS_AND;       
            tj.filterObject.filterOnTagsAnd = true;       
        }
        else {
            //tj.filterObject.filterMode &= ~(tj.FILTERMODE_TAGS_AND);       
            tj.filterObject.filterOnTagsAnd = false;       
        }
        tj.indexedDB.showAllJots(tj.filterObject);
    }

    // finally, persist the filter incase the user closes
    tj.indexedDB.persistFilterControlsState();
}

/* A wrapper for tagMgr.innerMerge. */
tagMgr.mergeStagedTags = function() {
    console.log("mergeStagedTags() called");
    var tagsField = document.getElementById("add_tagsinput");
    var tagString = tagsField.value;
    tagMgr.innerMerge(tagString);
}

/*
* Adds or removes tags from the master tag list maintained remotely via NimbusBase, and updates the UI
* select element on the page.
*
* mergeList - a list of tags to add or remove. This is a string of comma separated 'tag phrases' which
*             can contain white space.

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
tagMgr.innerMerge = function(mergeList) {
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
    //BUG/ISSUE due to removals being case-insensitive but adds, because it uses .indexOf, doesn't check
    //          case insensitively before adding. Thus we can add mX and MX but either -mX or -MX will
    //          remove both of them.
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
    tagMgr.populateSelector(existingMinusRemoved);
}

/* Places selected tags in Tags text field for jot being added. */
tagMgr.stageTags = function() {
    var textfield = document.getElementById('add_tagsinput');
    textfield.value = tagMgr.getSelectedTags().join(",");
}

/* Returns an array containing the tags currently selected in the tag selector list. */
tagMgr.getSelectedTags = function() {
    var tagSelector = document.getElementById('tagselector');
    var tags = [];
    var n = tagSelector.options.length;
    for(var i = 0; i < n; i++) {
        if(tagSelector.options[i].selected) {
            tags.push(tagSelector.options[i].value)
        }
    }
    return tags;
}

/* Clears the Tags text field for jot being added. */
tagMgr.clearStagedTags = function() {
    var textfield = document.getElementById('add_tagsinput');
    textfield.value = "";
}

/* Selects tags in the tag selector list. Used primarily at page load for restoring session filter state. */
tagMgr.selectTags = function(fromList) {
    if((fromList != undefined) && (fromList != null)) {
        var selector = document.getElementById('tagselector');
        var opts = selector.options;
        for(var i = 0; i < opts.length; i++) {
            if(fromList.indexOf(opts[i].value) != -1)
                opts[i].selected = true;
        }
    }
}
/*
* Populates the Tag Selector list select element on the page with the tags stored on the remote.
*
* fromList - optional argument. If present fromList should be the definitive tags list as an
*            array of strings. If fromList is undefined we will populate using the remote list.
*/
tagMgr.populateSelector = function(fromList) {
    //var allTags = [];
    //var tagList = fromList;
    var selector = document.getElementById('tagselector');
    if(fromList === undefined) {   // meaning pull from remote
        var tagContainer = nbx.Tags.all();    // should be one or zero items, we need the inner array
        if(tagContainer === undefined || tagContainer === null || tagContainer.length === 0)
            return null;
        fromList = tagContainer[0].tagList.split(",");
    }

    // now add however many of these: <option value="tagX">tagX</option>
    selector.innerHTML = "";
    for(var i = 0; i < fromList.length; i++) {
        var newItem = document.createElement("option");
        newItem.setAttribute("id", fromList[i]);
        newItem.setAttribute("value", fromList[i]);
        newItem.innerHTML = fromList[i];
        selector.appendChild(newItem);
    }
}

/*
* A currently minimal helper function that lets user's carriage returns shine through.
*   Very simple for now: we just replace n returns with with n <br />
*   elements. We do not yet create actual separate html paragraphs.
*
*   Also attempts to recognize urls and wrap them in <a></a> to make
*   them into real links within the jot.
*
*   That's all for the moment.
*
*  text - the contents (value) of the jot compose area
*/
tj.htmlizeText = function(text) {
    //var parse_url = /^(?:([A-Za-z]+):)?(\/{0,3})([0-9.\-A-Za-z]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?(?:#(.*))?/$;
	//var parse_url = /[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi;
	//var parse_url = /((http|ftp|https):\/\/)?[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/g;  // like all three: only sort of works
	
	//OK I've mod'd and munged and this works pretty well, probably has leaks, and doesn't yet handle
	//things like "file:///C:/WebSites/ThoughtJotBasic/tj.html" but it's definitely a decent start
	//but the long term solution is to use a real full editor widget for the jot composition area.
	//refs: started with /(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/
	//from: http://stackoverflow.com/questions/8188645/javascript-regex-to-match-a-url-in-a-field-of-text
	//and mod'd, mostly to not require a scheme
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
	return(htmlized);
}

/* Persists the user's preferred remote storage service. A stub for now as we only support Dropbox. */
tj.settingsSet = function(value) {
    if(value === 1) {

        // which service? (TODO support more possibilities, starting with local only)
        if(document.getElementById("remoteDropbox").checked) {
            //tj.filterObject.filterMode |= tj.FILTERMODE_TAGS_OR;       
            tj.service = tj.SERVICE_DROPBOX;
            ///tj.key = document.getElementById("DBKey").value;
            ///tj.secret = document.getElementById("DBSecret").value;
            ///if((tj.key !== nbx.sync_object.Dropbox.key) || (tj.secret !== nbx.sync_object.Dropbox.secret)) {
            ///    nbx.sync_object.Dropbox.key = tj.key;
            ///    nbx.sync_object.Dropbox.secret = tj.secret;
            ///    ///nimbus_init();   // attempt connection
            ///    nbx.open();
            ///}
        }
        else if(document.getElementById("remoteGoogle").checked) {
            tj.service = tj.SERVICE_GOOGLE;     
        }
        else {
            tj.service = tj.SERVICE_UNKNOWN;     
        }

        // attempt connection

    }

    $("#settingsDialog").dialog( "close" );
}
