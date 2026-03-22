const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { graphqlHTTP } = require('express-graphql');
const swaggerUi = require('swagger-ui-express');
const { initDb } = require('./db');
const { schema, rootValue } = require('./graphql');
const openApiSpec = require('./openapi');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const userRoutes = require('./routes/userRoutes');

app.use('/api/users', userRoutes);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use('/graphql', graphqlHTTP({
  schema,
  rootValue,
  graphiql: true
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api1-users' });
});

const PORT = process.env.PORT || 5001;

initDb()
  .then(() => {
    console.log('API1 PostgreSQL connected');
    app.listen(PORT, () => {
      console.log(`API1 running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('API1 PostgreSQL connection error:', error.message);
    process.exit(1);
  });
