const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
mongoose.connect('mongodb://localhost:27017/test', { useNewUrlParser: true });

const User = mongoose.model('User', { username: { type: String, unique: true }, password: String });
const Chat = mongoose.model('Chat', {
  from_user_id: mongoose.Schema.Types.ObjectId,
  from_user_name: String,
  to_user_id: mongoose.Schema.Types.ObjectId,
  to_user_name: String,
  message: String,
  datetime: { type: Date, default: Date.now }
});

const SECRET_KEY = '00001FA67586400';

const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

server.listen(3000, () => console.log('listening on 3000'));
let online_clients = []

io.on('connection', function (socket) {
  // console.log('client is connected', socket.handshake.headers.authorization.split(' ')[1]);
  let token_decoded = jwt.decode(socket.handshake.headers.authorization.split(' ')[1]);
  // console.log(token_decoded)
  online_clients.push({ socket_id: socket.id, username: token_decoded.username, user_id: token_decoded._id })
  socket.on('disconnect', function () {
    // console.log('client is disconnected', socket.id);
    online_clients = online_clients.filter(function (socket_obj) {
      console.log(socket_obj.socket_id, socket.id)
      return socket_obj.socket_id !== socket.id
    })
  });

  socket.on('sending_chat_message', function (data) {
    console.log(data);
    let direct_message = false;
    if (data.message[0] === '@') direct_message = true;
    const user_obj = online_clients.filter(user => {
      return user.username === data.message.split(' ')[0].substring(1)
    })
    if (direct_message) {
      // console.log(user_obj[0].socket_id)
      io.to(user_obj[0].socket_id).emit('broadcast_chat_message', data);
    } else {
      // send to all excluding owner
      socket.broadcast.emit('broadcast_chat_message', data);
      // send to all including owner
      // socket.emit('news', data);
    }

    // save in DB
  });

  // socket.on('I am typing', function (data) {
  //   console.log(data);
  //   // socket.emit('news', data);
  //   socket.broadcast.emit('someone is typing', data);
  // });
});


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


app.post('/signup', async (req, res) => {
  console.log(req.body)
  const hash = await bcrypt.hash(req.body.password, 10);
  const user_id = mongoose.Types.ObjectId();
  const user = new User({
    _id: user_id,
    username: req.body.username,
    password: hash
  });
  user.save().then(() => {
    const token = jwt.sign({ _id: user_id, username: req.body.username }, SECRET_KEY);
    res.json({ token })
  })
});

app.post('/login', async (req, res) => {
  // console.log(req.body)
  const user = await User.findOne({ username: req.body.username }).exec();
  // console.log(user)
  const result = await bcrypt.compareSync(req.body.password, user.password);
  const token = jwt.sign({ _id: user._id, username: user.username }, SECRET_KEY);
  res.json({ token })
});

app.get('/', (req, res) => {
  res.redirect('index.html')
});
app.get('/signup.html', (req, res) => {
  res.redirect('signup.html')
});
app.get('/online_users', (req, res) => {
  res.json({ data: online_clients })
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;