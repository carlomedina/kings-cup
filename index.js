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

app.get("/game/:channelID", function(req, res) {
  res.sendFile(__dirname + "/public/game.html");
});

app.post("/check_code", function(req, res){
  var code = req.body.code
  client.smembers("activeChannels", function(err, reply) {
    res.send(reply.indexOf(code) != -1)
  })
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
  // data - JSON {userID, channelID
  socket.on("joinChannel", function(data) {
    console.log(data.userID + " joined channel " + data.channelID)

    // join to the game's room
    socket.join(data.channelID)

    // Add to list of players
    client.lpush(data.channelID + "players", data.userID)

    // Tell the host that you joined so it increments
    // TODO: Use redis incr and decr for player number instead of length
    // socket.emit("joinChannel" + data.channelID)

    // Broadcast to all connected players in the room
    io.to(data.channelID).emit(data.channelID, '{"method": "new_player", "payload": "'+data.userID+'"}')
  })

// main workhorse
  socket.on("mailman", function(data) {
    var data = JSON.parse(data)
    var method = data.method
    console.log(data)
    console.log(method)
    if (method == 'create_channel') {
      // Create a random 6-character string
      const channelID = Math.random().toString(36).substr(2, 5)

      // Create a channel using the 6-character string
      socket.join(channelID)

      // send to the channel creator the channel code 
      io.to(channelID).emit('messages', '{"method": "initialize_channel", "payload" : {"channelID" : "' + channelID + '"}}')
  
      // Add the channelID to the list of all active channelID
      client.sadd("activeChannels", channelID)
      // Add the user to the channel"s list of players
      client.lpush(channelID + "players", data.payload.username)

      console.log("Channel '" + channelID + "' was created by user '" + data.payload.username + "'")

    } else if (method == 'join_channel') {
      const queueOfPlayers = data.payload.channelID + "players"
      socket.join(data.payload.channelID)
      client.lpush(queueOfPlayers, data.payload.username)
      console.log('PLAYER IS JOINING THE GAME. SENDING THE MESSAGE TO THE ROOM ' + data.payload.channelID)
      io.to(data.payload.channelID).emit('messages', '{"method" : "new_player", "payload" : {"username" : "' + data.payload.username + '"}}');

    } else if (method == 'start') {
      var channel = data.payload.channelID
      console.log('CHANNEL: ' + channel)
      console.log('sending signal to start the game')
      io.to(data.payload.channelID).emit('messages', '{"method" : "start", "payload" : {}}');

    } else if (method == 'card_play') {
      const queueOfCards = data.payload.channelID + "cards"
      const queueOfPlayers = data.payload.channelID + "players"
      client.lpop(queueOfCards, function (err, card) {
        client.lpop(queueOfPlayers, function (err, player) {
          const message = {
                            "method" : "next_player",
                            "payload" : 
                                      {
                                        "card" : card,
                                        "next_player" : player
                                      }
                          }
          io.to(data.payload.channelID).emit('messages', JSON.stringify(message))
          client.lpush(queueOfPlayers, player)
        })
      })
    }
  })



  // // when any player does a card uncover, do Redis pop to select a card to play
  // // publish the selected card to everyone on the channel

  // // params
  // // data - JSON {channelID, userID}
  // socket.on("cardPlay", function(data) {

  //   // do a redis pop to get a card
  //   const channelOfCards = data.channelID + "cards"
  //   client.lpop(channelOfCards, function(err, card) {
      
  //     // and get the next player 
  //     client.lpop(data.channelID, function(err, player) {

  //     // send the card and the next player to play
  //     var payload = {
  //                    "card": card,
  //                    "nextplayer": player
  //                   }

  //     // broadcast what card was played and who is to play next
  //     socket.emit(data.channelID, JSON.stringify(payload))

  //     // add the pushed player back to the end of the queue
  //     client.lpush(data.channelID, player)
  //     })
      
  //   })

  // })



  socket.on("disconnect", function () {
    console.log("A client disconnected");
  });

});



http.listen(3000, function(){
  console.log("listening on *:3000");
});