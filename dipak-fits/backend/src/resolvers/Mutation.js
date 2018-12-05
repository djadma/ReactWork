const Mutations = {
  async createItem(parent, args, ctx, info){
    // Todo check if they logged in

    const item = await ctx.db.mutation.createItem({
      data: {
        ...args
      }
    }, info)

    console.log(item);
    return item;
  }
};

module.exports = Mutations;
