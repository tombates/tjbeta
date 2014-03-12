// why is the code not what is being served i'm going crazy here...Our NimbusBase experimental code
// Let's encapsulate this stuff in another namespace
var nbx = {};

nbx.linkDropbox;
nbx.Jots;  // a model (table)
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
	//"synchronous": true
};

nbx.open = function() {
    //alert("new on DOMContentLoaded way and I am getting called.");

    console.log("in nbx.open, calling Nimbus.Auth.setup(nbx.sync_object");
    Nimbus.Auth.setup(nbx.sync_object);
    nbx.auth = Nimbus.Auth.authorized();
	if(nbx.auth) { // change link text to connected
			nbx.linkDropbox.innerHTML = "nbx.open: Connected to Dropbox already!";
	    //Nimbus.Auth.setup(sync_string);
    //DUDE you need to be calling authorize() first, but before that set a callback funtion authorized_callback = function...
    //then have the callback set the link text based on result of authorized there - that's the way you do it, silly
    // but i still don't understand why why get the test jots written to DB even when authorized is failing - unless it never
    // is really failing but we don't know that because we aren't using a callback - it's all making more sense now. It's better
    // feeling less sick
    Nimbus.Auth.authorized_callback = function() {
    	console.log("in authentication callback");
	    nbx.linkDropbox = document.getElementById("connectDropbox");
	    nbx.auth = Nimbus.Auth.authorized();
		if(nbx.auth) { // change link text to connected
			nbx.linkDropbox.innerHTML = "set by callback: Connected to Dropbox!";
		} else {
			nbx.linkDropbox.innerHTML = "set by callback: not connected to Dropbox";
		}
    };

	//git Nimbus.Auth.authorize();


    ///nbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "timestamp"]);
    nbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "time"]);
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
}

function nimbus_init() {
	nbx.open();  // connects to user storage using NimbusBase
}

window.addEventListener("DOMContentLoaded", nimbus_init, false);
