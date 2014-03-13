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

// Let's encapsulate our stuff in a namespace
var tj = {};
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

tj.indexedDB.db = null;
tj.indexedDB.order = "prev";   // default to showing newest jots at top
tj.indexedDB.onerror = function (e){
    console.log(e);
};

tj.indexedDB.open = function() {
    "use strict";
    var version = 4;
    var request = indexedDB.open("todos", version);  // returns an IDBOpenDBRequest object
	// see https://developer.mozilla.org/en-US/docs/IndexedDB/Using_IndexedDB
    request.onupgradeneeded = function(e) {
		var db = e.target.result;
		console.log("tj.indexedDB.open: in request.onupgradeneeded() callback");
		// A versionchange transaction is started automatically.
		e.target.transaction.onerror = tj.indexedDB.onerror;
		if(db.objectStoreNames.contains("todo")) {
			db.deleteObjectStore("todo");
		}		
		var store = db.createObjectStore("todo", {keyPath: "timeStamp"});
	};
	
	request.onsuccess = function(e) {
		console.log("tj.indexedDB.open: in request.onsuccess() callback");
		tj.indexedDB.db = e.target.result;
		// Do things here
		tj.indexedDB.getAllTodoItems();
	};
	
	request.onerror = tj.indexedDB.onerror;
};

tj.indexedDB.addTodo = function(todoText) {
	// add the jot to indexedDB store
	if(tj.STORE_MASK & tj.STORE_IDB == tj.STORE_IDB) {
    	var db = tj.indexedDB.db;
    	var trans = db.transaction(["todo"], "readwrite");
    	var store = trans.objectStore("todo");
    	var htmlizedText = htmlizeText(todoText);
    	var request = store.put({
    							"text": htmlizedText,
    							"timeStamp": new Date().getTime()
    							});
    	
    	request.onsuccess = function(e) {
    		tj.indexedDB.getAllTodoItems();
    	};
    	
    	request.onerror = function(e) {
    		console.log(e.value);
    	};
    }

	// also add to cloud storage location(s)
	if(tj.STORE_MASK & tj.STORE_DROPBOX == tj.STORE_DROPBOX) {
        //nbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "time"]);
        console.log("attempting store of real jot on DB");
        var now = Date().toString();
        nbx.jotreal = nbx.Jots.create({"descrip":"New jot", "done":false, "jot":htmlizedText, "time":now});
        //nbx.jotreal.jot = "does save do something to the time field?";
        //nbx.jotreal.save();
        //nbx.Jots.sync_all(function() {console.log("nbx.Jots.sync_all() callback called.")});
    }
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

tj.indexedDB.getAllTodoItems = function() {
	console.log("in getAllTodoItems");
	var todos = document.getElementById("todoItems");
	todos.innerHTML = "";
	
	var db = tj.indexedDB.db;
	var trans = db.transaction(["todo"], "readwrite");
	var store = trans.objectStore("todo");
	
	var keyRange = IDBKeyRange.lowerBound(0);
	var cursorRequest = store.openCursor(keyRange, tj.indexedDB.order);
	
	cursorRequest.onsuccess = function(e) {
		var result = e.target.result;
		if(!!result == false)   // the !! ensures result becomes true boolean value
		    return;
			
		renderTodo(result.value);
		//result.continue();    // compiler warning is bogus and due to 'continue' being a javascript keyword
		result['continue']();    // solution to warning, and for IE8 if we care
	};
	
	cursorRequest.onerror = tj.indexedDB.onerror;
};

/*
* Creates all the HTML elements for a single jot and sets them into the todoItems div
*/
function renderTodo(row) {
	// grab the containing div for jots
	var todos = document.getElementById("todoItems");
	
	// a div for each jot
	var jdiv = document.createElement("div");
	jdiv.className = "jotdiv";
	// a paragraph for the timestamp
	var pts = document.createElement("span");
	pts.className = "timestamp";
	// a paragraph for the jot - simple for now: just one basic paragraph is all we handle
	var pjot = document.createElement("p");
	pjot.className = "jottext";
	pjot.setAttribute("contenteditable", true);

	var dellink = document.createElement("a");
	dellink.className = "delete";
	dellink.textContent = " [Delete]";
	var editlink = document.createElement("a");
	editlink.className = "edit";
	//editlink.textContent = " [Edit]";
	editimage = document.createElement("img");
	editimage.src = ".\\images\\pen.png"
	//var ts = toString(row.timeStamp);
	var dt = new Date(row.timeStamp);   // get a Data obj back so we can call some presentation methods
	
	//var t = document.createTextNode(dt.toDateString() + "at " + dt.toTimeString() + ": " + row.text);
	pts.textContent = "Jotted on " + dt.toDateString() + " at " + dt.toLocaleTimeString() + ":";
	//pjot.textContent = row.text;
	pjot.innerHTML = row.text;
	//t.data = row.text;
	//console.log("in renderTodo");
	// wire up Delete link handler
	dellink.addEventListener("click", function(e) {
		//tj.indexedDB.deleteTodo(row.text);
		var yesno = confirm("Are you sure you want to delete this jot?\n\nThis is not undoable.");
		if(yesno) {
		    tj.indexedDB.deleteTodo(row.timeStamp);
        }
	});
	
	editlink.addEventListener("click", function(e) {
		//tj.indexedDB.deleteTodo(row.text);
		tj.indexedDB.editTodo(row.timeStamp);
	});
	
	//jdiv.appendChild(t);
	jdiv.appendChild(pts);
	editlink.appendChild(editimage);
	jdiv.appendChild(editlink);
	jdiv.appendChild(dellink);
	jdiv.appendChild(pjot);
	todos.appendChild(jdiv);
}

/*
* Places a previously made jot back into the edit area for changing. Also grays the
* div containing the original. OR could we edit it in place - putting a textarea into
* the jots div temporarily??? - would be nicer UX-wise
*
* What if every jot where a textarea instead of a div with paras - no this can't work
* textarea does not support html
*
* OH WAIT div with contenteditable = true might be the ticket!
*/
tj.indexedDB.editTodo = function(id) {

};

tj.indexedDB.deleteTodo = function(id) {
	var db = tj.indexedDB.db;
	var trans = db.transaction(["todo"], "readwrite");
	var store = trans.objectStore("todo");
	
	//var request = store.delete(id);
	var request = store['delete'](id);    // ugly but solves warning error due to delete being a keyword, just like continue issue
	
	request.onsuccess = function(e) {
		tj.indexedDB.getAllTodoItems();   // rerender with deleted item gone
	};
	
	request.onerror = function(e) {
		console.log(e);
	};
};

tj.indexedDB.emptyDB = function() {
	alert("in th.indexedDB.emptyDB");
    var version = 1;
	var request = indexedDB.open("todos", version);  // returns an IDBOpenDBRequest object
	// see https://developer.mozilla.org/en-US/docs/IndexedDB/Using_IndexedDB
	request.onupgradeneeded = function(e) {
		alert("I am called");
		var db = e.target.result;
		// A versionchange transaction is tarted automatically.
		e.target.transaction.onerror = tj.indexedDB.onerror;
		console.log("deleting objectstore");
		
		var store = db.deleteObjectStore("todo");
	};
	
};

function init() {
	tj.indexedDB.open();  // shows any data previously stored
}

window.addEventListener("DOMContentLoaded", init, false);

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
	tj.indexedDB.getAllTodoItems(); 
}

// add contents of text area as a new jot
function addTodo() {
	var todo = document.getElementById('todo');
	tj.indexedDB.addTodo(todo.value);
	todo.value = '';
}

function removeAll() {
	alert("Whoa! Deleting all jots is not reversible. Are you sure you want to do this?");
	//tj.indexedDB.emptyDB();
	
}



