var express = require('express')
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var redis = require('redis');


var client = redis.createClient(process.env.REDIS_URL)





// Routing
app.use(express.static('public'));

app.get('/driver', function(req, res){
  res.sendFile(__dirname + "/public/driver.html")
});

app.get('/rider', function(req, res){
  res.sendFile(__dirname + "/public/rider.html")
});


io.on('connection', function(socket){

  socket.on('connect', function() {
    console.log('A client connected')
  })
  
  // create a channel for a given session
  socket.on('createChannel', function(userID) {

    // create a random 6-character string
    const channelID = 

    // create a channel using the 6-character string
    // add the user to the channels' list of players
    // add the channelID to the list of all active channelID
    socket.join(channelID)
    client.lpush(channelID, userID)
    client.sadd('eactiveChannels', channelID)


    // initialize the deck of cards by randomly permuting a set and storing it
    // in a named Redis queue (also named the same way as the socket channel)
    const shuffledDeck

    var channelOfCards = channelID + 'cards'
    client.lpush(channelOfCards, shuffledDeck)


  })

  // end-point for other players to join a channel
  // params
  // data - JSON {userID, channelID}
  socket.on('joinChannel', function(data) {
    
    // join a channel
    socket.join(data.channelID)

    // add to list of players
    client.sadd(channelID, userID)

    // broadcast to all connected players who joined the game
    io.to(data.channelID).emit(userID + 'has joined the game')

  })




  // when any player does a card uncover, do a Redis pop to select a card to play
  // publish the selected card to everyone on the channel

  // params
  // data - JSON {channelID, userID}
  socket.on('cardPlay', function(data) {

    // do a redis pop to get a card
    const channelOfCards = 
    client.lpop(channelOfCards, function(err, card) {
      
      // and get the next player 
      client.lpop(data.channelID, function(err, player) {

      // send the card and the next player to play
      var payload = {
                     "card": card,
                     "nextplayer": player
                    }
      io.to(data.channelID).emit(payload)

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