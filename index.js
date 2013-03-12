#!/usr/bin/env node

var http = require('http');
var connect = require('connect');

var port = process.env.PORT || 5000;

function plain(request, response, next) {
  response.writeHead(200, {'Content-Type': 'text/plain'});
  response.end("Direct response (e.g. {{ 'now' | date }} isn't rendered)");
}

function liquid(request, response, next) {
  response.writeHead(200, {'Content-Type': 'application/liquid'});
  response.end("Rendered page for {{ shop.name }} at {{ 'now' | date }}");
}

function notFound(request, response, next) {
  response.writeHead(404, {'Content-Type': 'text/plain'});
  response.end('App Page Not Found');
}

function redirect(request, response, next) {
  response.writeHead(301, {'Location': '/plain'});
  response.end('Temporarily Moved');
}

function moved(request, response, next) {
  response.writeHead(301, {'Location': '/liquid'});
  response.end('Permanently Moved');
}

function error(request, response, next) {
  response.writeHead(request.query.code || 500);
  response.end('Error');
}

function hangup(request, response, next) {
  response.destroy();
}

function delay(request, response, next) {
  if (request.query.delay) {
    setTimeout(function() {
      next();
    }, +request.query.delay * 1000);
  } else {
    next();
  }
}

function homepage(request, response, next) {
  response.writeHead(200, {'Content-Type': 'text/html'});
  response.end('<html><body>App Proxy Test</body></html>');
}

function server(port) {
  var app = connect();
  app.use(connect.query());
  if (process.env.NODE_ENV !== 'test')
    app.use(connect.logger());
  app.use(delay);
  var proxy = connect();
  proxy.use('/liquid', liquid);
  proxy.use('/404', notFound);
  proxy.use('/redirect', redirect);
  proxy.use('/moved', moved);
  proxy.use('/error', error);
  proxy.use('/hangup', hangup);
  proxy.use(plain);
  app.use("/proxy", proxy);
  app.use(homepage);

  var server = http.createServer(app);
  server.listen(port, function() {
    console.log('Listening on ' + port);
  });
  return server;
}

if (require.main == module) {
  server(port);
}
