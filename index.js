var express = require('express')
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var redis = require('redis');

var client = redis.createClient(process.env.REDIS_URL || 'redis://localhost:6379');

// Routing
app.use(express.static('public'));

app.get('/entry', function(req, res){
  res.sendFile(__dirname + "/public/entry.html")
});

app.get('/create', function(req, res){
  res.sendFile(__dirname + "/public/create.html")
});

io.on('connection', function(socket){

  socket.on('connect', function() {
    console.log('A client connected')
  })
  
  // create a channel for a given session
  socket.on('createChannel', function(userID) {

    console.log('user ' + userID + 'joined the room')

    // create a random 6-character string
    const channelID = Math.random().toString(36).substr(2, 5)
    socket.emit('passChannelID', { id : channelID});

    console.log(channelID)

    // create a channel using the 6-character string
    // add the user to the channels' list of players
    // add the channelID to the list of all active channelID
    socket.join(channelID)
    socket.emit(channelID, 'Your channelID is ' + channelID)
    client.lpush(channelID, userID)
    client.sadd('activeChannels', channelID)


    // initialize the deck of cards by randomly permuting a set and storing it
    // in a named Redis queue (also named the same way as the socket channel)
    const shuffledDeck = ['Ac', 'Ad', 'Ah', 'As']

    var channelOfCards = channelID + 'cards'
    client.lpush(channelOfCards, shuffledDeck)
  })

  // end-point for other players to join a channel
  // params
  // data - JSON {userID, channelID}
  socket.on('joinChannel', function(data) {
    console.log(data.userID + ' joined the channel')

    // join a channel
    socket.join(data.channelID)

    // add to list of players
    client.lpush(data.channelID, data.userID)

    // broadcast to all connected players who joined the game
    socket.emit(data.channelID, data.userID + 'has joined the game')
  })

  // when any player does a card uncover, do a Redis pop to select a card to play
  // publish the selected card to everyone on the channel

  // params
  // data - JSON {channelID, userID}
  socket.on('cardPlay', function(data) {

    // do a redis pop to get a card
    const channelOfCards = data.channelID + 'cards'
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



  socket.on('disconnect', function () {
    console.log('A client disconnected');
  });

});



http.listen(3000, function(){
  console.log('listening on *:3000');
});