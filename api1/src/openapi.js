const spec = {
  openapi: '3.0.3',
  info: {
    title: 'RythmCast API1 - Users/Auth',
    version: '1.0.0',
    description: 'User authentication and profile service'
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Via gateway' },
    { url: 'http://localhost:5001', description: 'Direct API1 access' }
  ],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'User' }
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Service health status'
          }
        }
      }
    },
    '/api/users/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'User created' },
          400: { description: 'Validation error' }
        }
      }
    },
    '/api/users/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Login success' },
          401: { description: 'Invalid credentials' }
        }
      }
    },
    '/api/users/me': {
      get: {
        tags: ['User'],
        summary: 'Get current user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Current user profile' },
          401: { description: 'Unauthorized' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};

module.exports = spec;
