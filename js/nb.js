// why is the code not what is being served i'm going crazy here...Our NimbusBase experimental code
// Let's encapsulate this stuff in another namespace
var nbx = {};

nbx.linkDropbox;
nbx.Jots;  // a model (table)
nbx.jot1;
nbx.jot2;
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
    //Nimbus.Auth.setup(sync_string);
	nbx.auth = Nimbus.Auth.authorized();
    nbx.linkDropbox = document.getElementById("connectDropbox");
	if(nbx.auth) { // change link text to connected
		nbx.linkDropbox.innerHTML = "Connected to Dropbox!";
	} else {
		nbx.linkDropbox.innerHTML = "Connect to Dropbox_";
	}

    nbx.Jots = Nimbus.Model.setup("Jots", ["descrip", "done", "id", "jot", "timestamp"]);
	nbx.jot1 = nbx.Jots.create({"descrip":"New task", "done":false, "jot":"I have a thought."});
	nbx.jot2 = nbx.Jots.create({"descrip":"A Query", "done":false, "jot":"I have a question.", "time":"now" });
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
	nbx.Jots.destroyAll();
}

function nimbus_init() {
	nbx.open();  // connects to user storage using NimbusBase
}

window.addEventListener("DOMContentLoaded", nimbus_init, false);
