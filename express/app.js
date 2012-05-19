
/**
 * Module dependencies.
 */

var express = require('express');

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({ secret: 'your secret here' }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

Game = require('./game').Game;
games = new Game();

// create some dummy data
games.create({name:'alphachat classic',num_players:3}, function(){});

// Routes
app.get('/', function(req,res) {
  games.all(function(error, docs) {
    res.render('gamelist', { title:'Game List', games:docs })
  })
});

app.post('/', function(req,res,data) {
  games.create({ name: req.param('name'),
                 num_players: req.param('num_players') },
               function(error, docs) {
                 res.redirect('/');
               });
});

app.post('/join/:id', function(req,res,data) {
  games.find_by_id(req.params.id, function(error, doc) {
    if (error) {
      res.send("error: " + error.text);
    } else {
      if (doc) {
        doc.players.push('me');
        games.save(doc, function() {
          res.redirect('/game/'+req.params.id);
        });
      } else {
        res.send('not found');
      }
    }
  });
});

app.get('/game/:id', function(req, res) {
  games.find_by_id(req.params.id, function(error, doc) {
    if (error) {
      res.send("error: " + error.text);
    } else {
      if (doc) {
        res.render('gamewait', { title:'Game Wait', game: doc });
      } else {
        res.send('not found');
      }
    }
  });
});

app.listen(3000, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});