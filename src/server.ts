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

const tableCreationIfDoesNotExist = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL NOT NULL,
      created_at timestamp NOT NULL,
      status VARCHAR(255) NOT NULL default 'IN_PROGRESS',
      title VARCHAR(1024) NOT NULL,
      PRIMARY KEY (id)
    );`);
}

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json());

app.get('/api/tasks', async (req, res) => {
  await tableCreationIfDoesNotExist();
  const { rows } = await pool.query(`SELECT id, created_at, status, title FROM tasks ORDER BY created_at DESC LIMIT 100`);
  res.send(rows);
});

app.post('/api/tasks', async (req, res) => {
  const newTaskTitle = req.body.title;
  if (!newTaskTitle) {
    res.status(400).send("Title is required");
    return;
  }
  await tableCreationIfDoesNotExist();
  await pool.query(`INSERT INTO tasks(created_at, status, title) VALUES(NOW(), 'IN_PROGRESS', $1)`, [newTaskTitle]);
  res.sendStatus(200);
});

app.put('/api/tasks', async (req, res) => {
  const task: Task = req.body;
  if (!task || !task.id || !task.title || !task.status) {
    res.status(400).send("Invalid task data");
    return;
  }
  await tableCreationIfDoesNotExist();
  await pool.query(
    `UPDATE tasks SET status = $1, title = $2 WHERE id = $3`,
    [task.status, task.title, task.id]
  );
  res.sendStatus(200);
});

app.delete('/api/tasks', async (req, res) => {
  const task: Task = req.body;
  if (!task || !task.id) {
    res.status(400).send("Task ID is required");
    return;
  }
  await tableCreationIfDoesNotExist();
  await pool.query(`DELETE FROM tasks WHERE id = $1`, [task.id]);
  res.sendStatus(200);
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
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
* Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
*/
export const reqHandler = createNodeRequestHandler(app);
