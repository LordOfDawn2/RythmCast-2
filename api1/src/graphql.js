const { buildSchema } = require('graphql');
const db = require('./db');

const schema = buildSchema(`
  type Health {
    status: String!
    service: String!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    spotify_id: String
    created_at: String
  }

  type Query {
    health: Health!
    user(id: ID!): User
    usersCount: Int!
  }
`);

const rootValue = {
  health: () => ({ status: 'ok', service: 'api1-users-graphql' }),
  user: async ({ id }) => {
    const result = await db.query(
      'SELECT id, name, email, spotify_id, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },
  usersCount: async () => {
    const result = await db.query('SELECT COUNT(*)::int AS count FROM users');
    return result.rows[0].count;
  }
};

module.exports = {
  schema,
  rootValue
};
