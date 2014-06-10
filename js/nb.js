// why is the code not what is being served i'm going crazy here...Our NimbusBase experimental code
// Let's encapsulate this stuff in another namespace
var nbx = {};

nbx.linkDropbox;
nbx.Jots;  // a model (table) for the jots
nbx.Tags;  // current tags
nbx.jot1;
nbx.jot2;
nbx.jotreal;
nbx.auth = false;
nbx.sync_string = "eyJHRHJpdmUiOnsia2V5IjoiIiwic2NvcGUiOiIiLCJhcHBfbmFtZSI6IiJ9LCJEcm9wYm94Ijp7ImtleSI6Im5sc3pqNXhyaGxiMWs1cCIsInNlY3JldCI6ImZvOGEyNDRzZ2RmdGpiZiIsImFwcF9uYW1lIjoidGpiZXRhIn19"; 
nbx.sync_object = { 
	"Dropbox": { 
	  "key": "nlszj5xrhlb1k5p", 
	  "secret": "fo8a244sgdftjbf", 
	  "app_name": "tjbeta" 
	},
	"synchronous": true   // changed 6-10-2014 from commented out (and no comma) to see if this is part of prob auth'ing other users
};

nbx.userConnectRequest = function(serviceName) {
    ///if(Nimbus.Auth.authorized()) {
    ///	alert("Nothing to do: you're already connected.")
    ///}
    ///else {
    ///	Nimbus.Auth.authorize(serviceName);
    ///}
    //TODO when we get other users going comment that this is called by indexedDB_init if authorized fails
    //     of if user hits button to connect if it's in not connected state - assumes indexedDB_init has been called
    //     and calls nbx.open() assuming it has not (?)
    Nimbus.Auth.authorized_callback = function() {
        console.log("in authentication callback");
        //nbx.linkDropbox = document.getElementById("connectDropbox");
        nbx.auth = Nimbus.Auth.authorized();
        if(nbx.auth) { // change link text to connected
            nbx.linkDropbox.innerHTML = "set by callback: Connected to Dropbox!";
        } else {
            //nbx.linkDropbox.innerHTML = "set by callback: not connected to Dropbox";
            nbx.linkDropbox.style.backgroundImage = "url('images/dropboxbtn_notconnected.png')";
            nbx.linkDropbox.title = "You are NOT connected to cloud storage.";

        }
    };
    Nimbus.Auth.setup(nbx.sync_object);
    Nimbus.Auth.authorize(serviceName);
    nbx.open();
};

/*
* Called on DomContentLoaded event to see if we are connected and to set an authorize callback function.
*
* Note this function cannot itself call authorize("Dropbox") for example since that will take us away
* to the DropBox site, meaning when we return we will end up here again and so generate an infinite
* loop, which is not conducive to productive jotting. Thus the check and actual authorize call in
* userConnectRequest().
*
* TODO I'm still not happy with this approach. Need a completely programmatic way to handle this issue but
* the asynchronicity creates a problem.
*/
nbx.open = function() {

    console.log("nbx.open(): calling Nimbus.Auth.setup(nbx.sync_object)");

    nbx.linkDropbox = document.getElementById("cloudButton");

    // see if we need to get authorization data from user or local indexedDB storage
    var remoteKey = nbx.sync_object.Dropbox.key;
    var remoteSecret = nbx.sync_object.Dropbox.secret;
    ///commented out 6-9-2014 as we try to get others users working and discover the key/secret should not be necessary for them
    ///if((remoteKey === "") || (remoteSecret === "")) {
    ///  $( "#settingsDialog" ).dialog( "option", "width", 600 );
    ///  $( "#settingsDialog" ).dialog( "open" );
    ///  return;  // the Save button handler for the dialog will call this again after setting key/secret into sync_object
    ///}

    ///commented out 6-10-2014 for testing other users - should not be necessary except to setup app at app ownership level not for users
    ///Nimbus.Auth.setup(nbx.sync_object);
    nbx.auth = Nimbus.Auth.authorized();

    //TODO shouldn't this block really be inside Nimbus.Auth.authorized_callback...
	if(nbx.auth == true) { // change link text to connected
		//nbx.linkDropbox.value = "Connected";
        nbx.linkDropbox.style.backgroundImage = "url('images/dropboxbtn_connected.png')";
        nbx.linkDropbox.title = "You are connected to cloud storage.";
	        // NimbusBase new schema 3-22-2014:
	        // commonKeyTS, id, time, modTime, title, jot, tagList, extra, isTodo, done
        //OLDnbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "time"]);
        nbx.Jots = Nimbus.Model.setup("Jots", ["commonKeyTS", "id", "time", "modTime", "title", "jot", "tagList", "extra", "isTodo", "done"]);
        //nbx.Tags = Nimbus.Model.setup("Tags", ["id", "tagList", "extra"]);
        nbx.Jots.sync_all(function() {
            console.log("nbx.Jots.sync_all() callback called.");
            console.log("Nimbus instance count is now: " + nbx.Jots.count());
            if(tj.STORE_MASK & tj.STORE_IDB == tj.STORE_IDB) {
                indexedDB_init();
            }
            else {
                nbx.Tags = Nimbus.Model.setup("Tags", ["id", "tagList", "extra"]);
                nbx.Tags.sync_all(function() {
                    console.log("nbx.Tags.sync_all() callback called.");
                    filterManager_init();
                    resetFilterControlsState(tj.filterObject.filterTags);
                    showFilteredJots();

                    ///indexedDB_init();
                    //tj.indexedDB.showAllJots();  // now gets called via applyFilters call in tj.indexedDB.open
                                                   // so filterObject state is restored before showing any jots
                    // persist the remote authorization data if necessary
                    if((nbx.sync_object.Dropbox.key !== "") || (nbx.sync_object.Dropbox.secret !== ""))
                        persistAuthorization();
                });
           }
        });
        //nbx.Tags.sync_all(function() {
        //    console.log("nbx.Tags.sync_all() callback called.");
        //    tagManager_init();
        //});
    }
    else {
        console.log("Nimbus.Auth.authorized() returned FALSE");
    }
	    //Nimbus.Auth.setup(sync_string);
    //DUDE you need to be calling authorize() first, but before that set a callback funtion authorized_callback = function...
    //then have the callback set the link text based on result of authorized there - that's the way you do it, silly
    // but i still don't understand why why get the test jots written to DB even when authorized is failing - unless it never
    // is really failing but we don't know that because we aren't using a callback - it's all making more sense now. It's better
    // feeling less sick
    Nimbus.Auth.authorized_callback = function() {
    	console.log("in authentication callback");
	    //nbx.linkDropbox = document.getElementById("connectDropbox");
	    nbx.auth = Nimbus.Auth.authorized();
		if(nbx.auth) { // change link text to connected
			nbx.linkDropbox.innerHTML = "set by callback: Connected to Dropbox!";
		} else {
            //nbx.linkDropbox.innerHTML = "set by callback: not connected to Dropbox";
            nbx.linkDropbox.style.backgroundImage = "url('images/dropboxbtn_notconnected.png')";
            nbx.linkDropbox.title = "You are NOT connected to cloud storage.";

		}
    };

	//git Nimbus.Auth.authorize("Dropbox");  we can't do this here because doing so takes us away from this page to Dropbox
	//                                       which means we come back again to nbx.open and now we have an infinite loop


    ///nbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "timestamp"]);

    // Create the Jots table
    //3-21-14 moved into nbx.auth==true code above     nbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "time"]);

	//just a test nbx.jot1 = nbx.Jots.create({"descrip":"New task", "done":false, "jot":"I have a thought."});
	//just a test nbx.jot2 = nbx.Jots.create({"descrip":"A Query", "done":false, "jot":"I have a question.", "time":"now" });
	//instance = Jots.findAllByAttribute("done", false);
	//instance.done = false;
    //instance.save();
	
	// i don't understand: merely creating the jots instances writes them over to dropbox, the saves are not needed, also meaning
	// i can't test if i can save a whole model (table?) at once instead of just one instance (row) at a time. if not isn't that crazy
	// inefficient. i want a way to send the whole table over as a text file in one go - a save whole model
	// and how to get a timestamp,
	// some keys seem special, like "id" but is there a list of these in the docs? can't find
	// once authorized always authorized? seems weird. when i reload i'm still authorized apparently, i would
	// think when the connection ends you'd need some reauth but maybe this is user convencience but is it a good/secure idea?
	
	
	
	//jot1.save();
	//jot1.save();
	//Jots.save();

	// destroyAll does not seem to affect the dropbox stored jots...???
	//console.log("calling destroyAll()");
	//nbx.Jots.destroyAll();
	//console.log("back from destroyAll()");
};

/* If there is not persisted authorization data or there is persisted authorization data already stored (in ndexedDB)
*  and the current data is different from current sync_object, we perist the current sync_object information. This implies
*  this function should be called only when the current sync_object has led to a successful remote connection.
*/
function persistAuthorization() {
    console.log("persistAuthorization");
    // gather user's currently selected and staged tags, and any filter state

    // persist it for the next session using this browser on this device

        var db = tj.indexedDB.db;
        var trans = db.transaction(["SessionState"], "readwrite");
        trans.oncomplete = function(e) {
            console.log("persistAuthorization trans.oncomplete() called");
        }
        trans.onerror = function(e) {
            console.log("persistAuthorization trans.onerror() called");
            console.log(trans.error);
        }
        // IndexedDB on client side new schema 3-22-2014:
        // {keyPath: "commonKeyTS"}, "nimbusID", nimbusTime, modTime, title, jot", "tagList", "extra", isTodo", "done", 
        var store = trans.objectStore("SessionState");
        var row = {"name":"authorizationState",
                   "service":"Dropbox",
                   "primary":nbx.sync_object.Dropbox.key,
                   "secondary":nbx.sync_object.Dropbox.secret};
        var paRequest = store.put(row);  // for now at least there is only one persisted filterObject
                
        paRequest.onsuccess = function(e) {
            console.log("persistAuthorization request.onsuccess");
            //var jotDiv = renderJot(row);
            //var jotsContainer = document.getElementById("jotItems");
        };
        
        paRequest.onerror = function(e) {
            console.log(e);
        };
}

function nimbus_init() {
	console.log("doing NimbusBase nimbus_init()");
    indexedDB_init();
	///nbx.open();  // connects to user storage using NimbusBase
}

window.addEventListener("DOMContentLoaded", nimbus_init, false);
