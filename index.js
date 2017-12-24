const express = require("express")
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const redis = require("redis");
const bodyParser = require("body-parser");
const client = redis.createClient(process.env.REDIS_URL || "redis://localhost:6379");

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
  const code = req.body.code
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


io.on("connection", function(socket) {

  socket.on("connect", function() {
    console.log("A client connected");
  });
  
  // main workhorse
  socket.on("mailman", function(data) {
    var data = JSON.parse(data)
    const method = data.method

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
      // client.lpush(channelID + "players", data.payload.username)

      var deck = ["Ac", "Ad", "Ah", "As", 
                          "2c", "2d", "2h", "2s",
                          "3c", "3d", "3h", "3s",
                          "4c", "4d", "4h", "4s",
                          "5c", "5d", "5h", "5s",
                          "6c", "6d", "6h", "6s",
                          "7c", "7d", "7h", "7s",
                          "8c", "8d", "8h", "8s",
                          "9c", "9d", "9h", "9s",
                          "10c", "10d", "10h", "10s",
                          "Jc", "Jd", "Jh", "Js",
                          "Qc", "Qd", "Qh", "Qs", 
                          "Kc", "Kd", "Kh", "Ks"]

      shuffleArray(deck)
      client.lpush(channelID + "cards", deck)
      client.set(channelID + "kings", 4)

      console.log("[INFO]: Channel '" + channelID + "' was created by user '" + data.payload.username + "'")

    } else if (method == 'join_channel') {
      const listOfPlayers = data.payload.channelID
      const queueOfPlayers = data.payload.channelID + "players"

      socket.join(data.payload.channelID)
      client.sismember(listOfPlayers, data.payload.username, function(err, ismember) {
        if (ismember == 0) {
          client.lpush(queueOfPlayers, data.payload.username)
          client.sadd(listOfPlayers, data.payload.username)
        }

        // get all connected players
        client.lrange(queueOfPlayers, 0, -1, function (err, listOfPlayers) {
          console.log(listOfPlayers)
          io.to(data.payload.channelID).emit('messages', '{"method" : "new_player", "payload" : {"username" : ' + JSON.stringify(listOfPlayers) + '}}');
          console.log('[INFO]: '+ data.payload.username + ' joined the channel ' + data.payload.channelID)
        })
      })
    
    } else if (method == 'start') {
      const channel = data.payload.channelID
      io.to(data.payload.channelID).emit('messages', '{"method" : "start", "payload" : {}}');
      console.log('[INFO]: The game in room '+ data.payload.channelID + 'is starting')


    } else if (method == 'game_play') {
      const queueOfPlayers = data.payload.channelID + "players"
      socket.join(data.payload.channelID)
      client.lrange(queueOfPlayers, 0, -1, function (err, listOfPlayers) {
          console.log(listOfPlayers)
          client.lrange(queueOfPlayers, -1, -1, function (err, player) {
            io.to(data.payload.channelID).emit('messages', '{"method" : "game_play", "payload" : {"number_players" : ' + listOfPlayers.length + ', "next_player" : "'+ player +'"}}');
          })
        })

    } else if (method == 'card_play') {
      const queueOfCards = data.payload.channelID + "cards"
      const queueOfPlayers = data.payload.channelID + "players"
      const kingsChannel = data.payload.channelID + "kings"
      client.lpop(queueOfCards, function (err, card) {
        client.lpop(queueOfPlayers, function (err, player) {
          client.get(kingsChannel, function (err, num) {
            // Game ends when all kings have been drawn
            var end = (card[0] == 'K' && num == 1)
            if (card[0] == 'K') {
              client.decr(kingsChannel)
            }

            var method = end ? "game_end" : "card_play"
            var name = end ? data.payload.username : player

            const message = {
              "method" : method,
              "payload" : 
                {
                  "card" : card,
                  "next_player" : name
                }
            }
            io.to(data.payload.channelID).emit('messages', JSON.stringify(message))
            client.rpush(queueOfPlayers, player)
          })
        })
      })
    }
  })

  socket.on("disconnect", function () {
    console.log("A client disconnected");
  });

});


// HELPER FUNCTIONS
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}


http.listen(3000, function(){
  console.log("listening on *:3000");
});



















