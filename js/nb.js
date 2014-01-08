// Our NimbusBase using code

// Let's encapsulate this stuff in another namespace
var nb = {};

nb.linkDropbox;
nb.Tasks;  // a model (table)
nb.ja;
nb.jb;
nb.auth = false;
nb.sync_string = "eyJHRHJpdmUiOnsia2V5IjoiIiwic2NvcGUiOiIiLCJhcHBfbmFtZSI6IiJ9LCJEcm9wYm94Ijp7ImtleSI6Im5sc3pqNXhyaGxiMWs1cCIsInNlY3JldCI6ImZvOGEyNDRzZ2RmdGpiZiIsImFwcF9uYW1lIjoidGpiZXRhIn19"; 
nb.sync_object = { 
	"Dropbox": { 
	  "key": "nlszj5xrhlb1k5p", 
	  "secret": "fo8a244sgdftjbf", 
	  "app_name": "tjbeta" 
	} 
};

    Nimbus.Auth.setup(nb.sync_object);
    //Nimbus.Auth.setup(sync_string);
	nb.auth = Nimbus.Auth.authorized();
    nb.linkDropbox = document.getElementById("connectDropbox");
	if(nb.auth) { // change link text to connected
		nb.linkDropbox.innerHTML = "Connected to Dropbox";
	} else {
		nb.linkDropbox.innerHTML = "Connect to Dropbox";
	}

    nb.Tasks = Nimbus.Model.setup("Tasks", ["descrip", "done", "id", "jot", "timestamp"]);
	nb.ja = Tasks.create({"descrip":"New task", "done":false, "jot":"I have a thought."});
	nb.jb = Tasks.create({"descrip":"A Query", "done":false, "jot":"I have a question.", "time":"now" });
	//instance = Tasks.findAllByAttribute("done", false);
	//instance.done = false;
    //instance.save();
	
	// i don't understand: merely creating the tasks instances writes them over to dropbox, the saves are not needed, also meaning
	// i can't test if i can save a whole model (table?) at once instead of just one instance (row) at a time. if not isn't that crazy
	// inefficient. i want a way to send the whole table over as a text file in one go - a save whole model
	// and how to get a timestamp,
	// some keys seem special, like "id" but is there a list of these in the docs? can't find
	// once authorized always authorized? seems weird. when i reload i'm still authorized apparently, i would
	// think when the connection ends you'd need some reauth but maybe this is user convencience but is it a good/secure idea?
	
	
	
	//ja.save();
	//jb.save();
	//Tasks.save();
	nb.Tasks.destroyAll();
