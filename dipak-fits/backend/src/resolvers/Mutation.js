const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// crypto build in module to node
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeEmail } = require('../mail');
const { hasPermission } = require('../utils');

const Mutations = {
  async createItem(parent, args, ctx, info){
    // Todo check if they logged in
    if(!ctx.request.userId) {
      throw new Error('You must be login in to do that!')
    }
    // create item
    const item = await ctx.db.mutation.createItem({
      data: {
        // This is the way you provide relation ship between user and items
        user: {
          connect: {
            id: ctx.request.userId
          },
        },
        ...args
      }
    }, info)

    console.log(item);
    return item;
  },
  updateItem(parent, args, ctx, info){
    // first take a copy of the updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateItem({
      data: updates,
      where: {
        id: args.id
      }
    }, info)
  },
  async deleteItem(parent, args, ctx, info){
    const where = { id: args.id };
    // 1. find the item
    const item = await ctx.db.query.item({ where }, `{ id title user { id }}`);
    // 2. check if then own that item, or have the permissions
    const ownsItem = item.user.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some
    (permission => 
      ['ADMIN', 'ITEMDELETE'].includes(permission)
    );

    if (!ownsItem && hasPermissions){
      throw new Error("You don't have permission to do that")
    }
    // 3. delete it!
    return ctx.db.mutation.deleteItem({ where }, info);
  },
  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();
    // hash their password
    const password = await bcrypt.hash(args.password, 10);
    // create the user in db
    const user = await ctx.db.mutation.createUser({
      data: {
        ...args,
        password,
        permissions: { set: ['USER']}
      }
    }, info);
    // create the JWT token for them
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    // we set the jwt as a cookie on the response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, //1 year cookie
    });
    // finally we return the user to the browser
    return user;
  },
  async signin(parent, { email, password }, ctx, info) {
    // 1. check if there is user with that email
    const user = await ctx.db.query.user({ where: {
      email
    }})
    if (!user){
      throw new Error(`No such user found for this email ${email}`);
    }
    // 2. check if their password is correct
    const valid = await bcrypt.compare(password, user.password)
    if (!valid){
      throw new Error('Invalid password!')
    }
    // 3. genrate the JWT Token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET); 
    // 4. Set the cookie with the token
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, //1 year cookie
    });
    // 5. Return the user
    return user;
  },
  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'Successfully Logout'};
  },
  async requestReset(parent, { email }, ctx, info) {
    // 1. check if there is user with that email
    const user = await ctx.db.query.user({ where: {
      email
    }})
    if (!user){
      throw new Error('Email Not found')
    }
    // 2. set reset token and expiry 
    const randomBytesPromiseified = promisify(randomBytes);
    const resetToken = (await randomBytesPromiseified(20)).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email: email},
      data: {
        resetToken,
        resetTokenExpiry
      }
    })
    // 3. Email them that reset password link
      const mailRes = await transport.sendMail({
        from: 'jadamdipak@gmail.com',
        to: user.email,
        subject: 'Your password reset token',
        html: makeEmail(`Your Password Reset Token is here! 
        \n\n 
        <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click Here to Reset</a>`)
      })
    // 4. Return the message
    return { message: 'Reset password link send to your email'};
  },
  async resetPassword(parent, args, ctx, info) {
    // 1. check if the password match
    if(args.password !== args.confirmPassword){
      throw new Error('confirm password mis match')
    }
    // 2. check if its a legit reset token
    // 3. check if its expired
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000
      }
    });
    if(!user){
      throw new Error('This token is either invalid or expired!')
    }
    // 4. hash their new password
    const password = await bcrypt.hash(args.password, 10);
    // 5. save the new password and remove old reset token
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null
      }
    }, info);
    // 6. genrate JWT
    const token = await jwt.sign({userId: user.id}, process.env.APP_SECRET);
    // 7. Set the JWT cookie
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 *365, //1 year cookie

    })
    // 8. return the new user
    return user;
  },
  async updatePermissions(parent, args, ctx, info) {
    //1. first check if they are login
    if(!ctx.request.userId) {
      throw new Error("please login");
    }
    //2. query for current user
    const current_user = await ctx.db.query.user({
      where: {id: ctx.request.userId}
    }, info)
    //3. check if they have permissions to do this
    hasPermission(current_user, ['ADMIN', 'PERMISSIONUPDATE']);
    //4. update the permissions
    ctx.db.mutation.updateUser({
      data: {
        permissions: {
          set: args.permissions,
        }
      },
      where: {
        id: args.userId,
      },
    }, info)
  },
  async addToCart(parent, args, ctx, info) {
    //1. Make sure they are sign in
    const { userId } = ctx.request;
    if(!userId) {
      throw new Error('You must be signed in');
    }
    //2. Query the users current cart
    const [existingCartItem] = await ctx.db.query.cartItems({
      where: {
        user: { id: userId },
        item: { id: args.id }
      }
    });
    //3. check if that item is already n their cart and increment by 1 if it is
    if(existingCartItem) {
      console.log('This item is already in there cart')
      return ctx.db.mutation.updateCartItem({
        where: { id: existingCartItem.id },
        data: { quantity: existingCartItem.quantity + 1 }
      }, info)
    }
    //4. if its not, create a fresh cartitemfor that user
    return ctx.db.mutation.createCartItem({
      data: {
        user: {
          connect: { id: userId },
        },
        item: {
          connect: { id: args.id },
        }
      }
    }, info)
  } 
};

module.exports = Mutations;
