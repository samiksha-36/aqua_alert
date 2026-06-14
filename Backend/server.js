import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { initWebSocket } from './services/websocket.js';

import alertRoutes     from './routes/alerts.js';
import reporterRoutes  from './routes/reporters.js';
import grievanceRoutes from './routes/grievances.js';
import telegramRoutes from './routes/telegram.js';

const app    = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/alerts',     alertRoutes);
app.use('/api/reporters',  reporterRoutes);
app.use('/api/grievances', grievanceRoutes);
app.use('/api/telegram',   telegramRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', websocket: true, time: new Date().toISOString() }));

initWebSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`[SERVER] Running on http://localhost:${PORT}`));