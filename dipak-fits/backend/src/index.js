const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'variables.env' });
const createServer = require('./createServer');
const db = require('./db');

const server = createServer();


// Todo use express middleware to handle cookies (JWT)
server.express.use(cookieParser());
// decode the JWT so we can get the user id on each request
server.express.use((req, res, next)=> {
  const { token } = req.cookies;
  if(token){
    const {userId} = jwt.verify(token, process.env.APP_SECRET);
    // put the userid onto the request for further requests to access
    req.userId = userId;
  }
  next();
});

//2. create a middleware that populates the suers of each request
server.express.use(async (req, res, next) => {
  // if there not login in skiped this
  if (!req.userId) return next();
  const user = await db.query.user(
    { where: { id: req.userId}},
    '{ id, permissions, email, name}'
  );
  req.user = user;
  console.log(user);
  next();
})


server.start(
  {
    cors: {
      credentials: true,
      origin: process.env.FRONTEND_URL,
    },
  }, 
  deets => {
    console.log(`server running is ruuning on port http:/localhost:${deets.port}`) 
  }
);