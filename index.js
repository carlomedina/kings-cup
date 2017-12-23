var express = require("express")
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);
var redis = require("redis");
var bodyParser = require("body-parser");

var client = redis.createClient(process.env.REDIS_URL || "redis://localhost:6379");

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Routing
app.use(express.static("public"));

app.get("/entry", function(req, res){
  res.sendFile(__dirname + "/public/entry.html")
});

app.get("/create", function(req, res){
  res.sendFile(__dirname + "/public/create.html")
});

app.get("/join", function(req, res){
  res.sendFile(__dirname + "/public/join.html")
});

app.get("/waiting_room", function(req, res){
  res.sendFile(__dirname + "/public/waiting_room.html")
});

app.post("/check_code", function(req, res){
  var code = req.body.code
  client.smembers("activeChannels", function(err, reply) {
    res.send(reply.indexOf(code) != -1)
  }
})

// POST REQUQEST TO GET CARD IMAGE
app.post("/card_image", function(req, res) {
  console.log(req)
  var cardname = req.body.card + ".png"
  res.sendFile(__dirname + "/public/cards/PNG/" + cardname)
})


io.on("connection", function(socket){

  socket.on("connect", function() {
    console.log("A client connected")
  })
  
  // Create a channel for a given session
  socket.on("createChannel", function(userID) {

    // Create a random 6-character string
    const channelID = Math.random().toString(36).substr(2, 5)

    // Pass the string to client
    socket.emit("passChannelID", { id : channelID });

    // Create a channel using the 6-character string
    socket.join(channelID)
    // Add the channelID to the list of all active channelID
    client.sadd("activeChannels", channelID)
    // Add the user to the channel"s list of players
    client.lpush(channelID + "players", userID)

    console.log("Channel '" + channelID + "' was created by user '" + userID + "'")

    // TODO: in more detail
    // initialize the deck of cards by randomly permuting a set and storing it
    // in a named Redis queue (also named the same way as the socket channel)
    // const shuffledDeck = ["Ac", "Ad", "Ah", "As"]

    // var channelOfCards = channelID + "cards"
    // client.lpush(channelOfCards, shuffledDeck)
  })

  // Check if a channel is available to be joined
  socket.on("checkChannel", function(channelID) {

    // Grab all channels and check
    client.smembers("activeChannels", function(err, reply) {

      // Send results
      socket.emit("validChannel", (reply.indexOf(channelID) != -1));
    });
  })

  // end-point for other players to join a channel
  // params
  // data - JSON {userID, channelID}
  socket.on("joinChannel", function(data) {
    console.log(data.userID + " joined channel " + data.channelID)

    // Add to list of players
    client.lpush(data.channelID + "players", data.userID)

    // Tell the host that you joined so it increments
    // TODO: Use redis incr and decr for player number instead of length
    // socket.emit("joinChannel" + data.channelID)

    // Broadcast to all connected players who joined the game
    socket.emit(data.channelID, '{"method": "new_player", "payload": "'+data.userID+'"}')
  })

  // when any player does a card uncover, do a Redis pop to select a card to play
  // publish the selected card to everyone on the channel

  // params
  // data - JSON {channelID, userID}
  socket.on("cardPlay", function(data) {

    // do a redis pop to get a card
    const channelOfCards = data.channelID + "cards"
    client.lpop(channelOfCards, function(err, card) {
      
      // and get the next player 
      client.lpop(data.channelID, function(err, player) {

      // send the card and the next player to play
      var payload = {
                     "card": card,
                     "nextplayer": player
                    }

      // broadcast what card was played and who is to play next
      socket.emit(data.channelID, JSON.stringify(payload))

      // add the pushed player back to the end of the queue
      client.lpush(data.channelID, player)
      })
      
    })

  })



  socket.on("disconnect", function () {
    console.log("A client disconnected");
  });

});



http.listen(3000, function(){
  console.log("listening on *:3000");
});