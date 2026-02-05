import express from 'express';
import path from 'path';

const app = express();

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Serve test-client.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../test-client.html'));
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Máy chủ HTML đang chạy tại http://localhost:${PORT}`);
});
