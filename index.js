#!/usr/bin/env node

var http = require('http');
var https = require('https');
var querystring = require('querystring')
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

function htmlLink(text, url) {
  if (url) {
    return '<a href="' + url + '">' + text + '</a>';
  } else {
    return text;
  }
}

function homepage(request, response, next) {
  response.writeHead(200, {'Content-Type': 'text/html'});
  var authorizeUrl = null;

  if (process.env.SHOPIFY_API_KEY) {
    var params  = {
      client_id: process.env.SHOPIFY_API_KEY,
      scope: 'read_content',
      redirect_uri: 'http://app-proxy-test.herokuapp.com/install'
    };
    authorizeUrl = "https://www.shopify.com/admin/oauth/authorize?" + querystring.stringify(params);
  }
  response.end("<html><body><h1>App Proxy Test</h1><p>" + htmlLink("Install", authorizeUrl) + " in your shopify store.</p></body></html>");
}

function install(request, response, next) {
  if (!request.query.code || !request.query.shop) {
    response.writeHead(422);
    response.end();
    return;
  }
  var params = {
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    code: request.query.code
  };
  var postBody = JSON.stringify(params);
  var shopifyReq = https.request({
    host: request.query.shop,
    method: "POST",
    path: "/admin/oauth/access_token",
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': postBody.length
    }
  }, function(shopifyRes) {
    if (shopifyRes.statusCode >= 200 && shopifyRes.statusCode < 300) {
      var buf = '';
      shopifyRes.setEncoding('utf8');
      shopifyRes.on('data', function(chunk){ buf += chunk });
      shopifyRes.on('end', function(){
        var data = JSON.parse(buf);
        console.log(request.query.shop + ' access token: ' + data.access_token);
        response.writeHead(301, {'Location': 'https://www.shopify.com/admin/apps'});
        response.end();
      });
    } else {
      response.writeHead(shopifyRes.statusCode, {'Content-Type': shopifyRes.headers['content-type']});
      shopifyRes.pipe(response);
    }
    shopifyRes.on('error', next);
  });
  shopifyReq.on('error', next);
  shopifyReq.end(postBody);
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
  app.use("/install", install);
  app.use("/", homepage);

  var server = http.createServer(app);
  server.listen(port, function() {
    console.log('Listening on ' + port);
  });
  return server;
}

if (require.main == module) {
  server(port);
}
