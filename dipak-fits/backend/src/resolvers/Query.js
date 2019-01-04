const { forwardTo } = require('prisma-binding');
const { hasPermission } = require('../utils');

const Query = {
  items: forwardTo('db'),
  item: forwardTo('db'),
  itemsConnection: forwardTo('db'),
  me(parent, args, ctx, info){
    // check if there is a current user
    if(!ctx.request.userId){
      return null;
    }
    return ctx.db.query.user(
      {
        where: { id: ctx.request.userId },
      }, 
      info
    );
  },
  async users(parent, args, ctx, info) {
    // 1. check it that logged in
    if (!ctx.request.userId){
      throw new Error('You must be login!')
    }
    // 2. check if user has permissions to query all thr users
    hasPermission(ctx.request.user, ['ADMIN', 'PERMISSIONUPDATE']);
    // 3. if they do, query all the users
    return ctx.db.query.users({}, info); 
  },
  async order(parent, args, ctx, info) {
    //1 make sure user logged in
    if (!ctx.request.userId){
      throw new Error('You must be login!')
    }
    //2. query the current order
    const order = await ctx.db.query.order({
      where: { id: args.id },
    }, info)
    //3. check if the have the permissions to see this order
    const ownsOrder = order.user.id === ctx.request.userId;
    const hasPermissionToSeeOrder = ctx.request.user.permissions.includes('ADMIN');
    if(!ownsOrder || !hasPermissionToSeeOrder){
      throw new Error('You cant see this order');
    }
    //4 return the order
    return order;
  }, 

  async orders(parent, args, ctx, info) {
    //1 make sure user logged in
    if(!ctx.request.userId){
      throw new Error('You must be login!')
    }

    const orders = await ctx.db.query.orders({
      where: {user: { id: ctx.request.userId } },
    }, info)

    return orders;
  }
};

module.exports = Query;
