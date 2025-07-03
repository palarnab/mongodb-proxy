import { app, connectDB } from './app.js';

const port = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Server listening on port ${port}`);
  });
});
