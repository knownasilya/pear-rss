import { HttpRouter, HttpServer } from '@effect/platform';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { toHttpApp } from '@effect/rpc-http/HttpRouter';
import { Layer } from 'effect';
import { createServer } from 'node:http';
import { appRouter } from './router';

const HttpLive = HttpRouter.empty.pipe(
  HttpRouter.post('/rpc', toHttpApp(appRouter)),
  HttpServer.serve(),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
);

NodeRuntime.runMain(Layer.launch(HttpLive));
