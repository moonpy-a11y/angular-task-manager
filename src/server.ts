import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from '../node_modules/@types/pg';
import { AuthTypes, Connector } from '@google-cloud/cloud-sql-connector';
import { GoogleAuth } from 'google-auth-library';
const auth = new GoogleAuth();

const { Pool } = pg;

type Task = {
  id: string;
  title: string;
  status: 'IN_PROGRESS' | 'COMPLETE';
  createdAt: number;
};

const projectId = await auth.getProjectId();

const connector = new Connector();
const clientOpts = await connector.getOptions({
  instanceConnectionName: `${projectId}:us-central1:quickstart-instance`,
  authType: AuthTypes.IAM,
});

const pool = new Pool({
  ...clientOpts,
  user: `quickstart-service-account@${projectId}.iam`,
  database: 'quickstart_db',
});

// Initialize tables on startup
const initializeTables = async () => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL NOT NULL,
      created_at timestamp NOT NULL,
      status VARCHAR(255) NOT NULL default 'IN_PROGRESS',
      title VARCHAR(1024) NOT NULL,
      PRIMARY KEY (id)
    )`);
    
    // Create index for frequently sorted column
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_created_at 
      ON tasks(created_at DESC)`);
    
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    throw error;
  }
};

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json());

app.get('/api/tasks', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { rows } = await pool.query(
      `SELECT id, created_at, status, title FROM tasks 
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.send(rows);
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    res.status(500).send('Failed to fetch tasks');
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const newTaskTitle = req.body.title;
    if (!newTaskTitle || typeof newTaskTitle !== 'string') {
      res.status(400).send('Title is required and must be a string');
      return;
    }
    
    await pool.query(
      `INSERT INTO tasks(created_at, status, title) VALUES(NOW(), 'IN_PROGRESS', $1)`,
      [newTaskTitle]
    );
    res.sendStatus(200);
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    res.status(500).send('Failed to create task');
  }
});

app.put('/api/tasks', async (req, res) => {
  try {
    const task: Task = req.body;
    if (!task || !task.id || !task.title || !task.status) {
      res.status(400).send('Invalid task data');
      return;
    }
    
    const validStatuses = ['IN_PROGRESS', 'COMPLETE'];
    if (!validStatuses.includes(task.status)) {
      res.status(400).send('Invalid task status');
      return;
    }
    
    const result = await pool.query(
      `UPDATE tasks SET status = $1, title = $2 WHERE id = $3`,
      [task.status, task.title, task.id]
    );
    
    if (result.rowCount === 0) {
      res.status(404).send('Task not found');
      return;
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('PUT /api/tasks error:', error);
    res.status(500).send('Failed to update task');
  }
});

app.delete('/api/tasks', async (req, res) => {
  try {
    const task: Task = req.body;
    if (!task || !task.id) {
      res.status(400).send('Task ID is required');
      return;
    }
    
    const result = await pool.query(`DELETE FROM tasks WHERE id = $1`, [task.id]);
    
    if (result.rowCount === 0) {
      res.status(404).send('Task not found');
      return;
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('DELETE /api/tasks error:', error);
    res.status(500).send('Failed to delete task');
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/**', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  
  // Initialize database before starting server
  await initializeTables();
  
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
