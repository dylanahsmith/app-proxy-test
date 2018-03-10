#!/usr/bin/env node

var http = require('http');
var https = require('https');
var querystring = require('querystring');
var connect = require('connect');

var port = process.env.PORT || 5000;

function plain(request, response, next) {
  response.writeHead(200, {'Content-Type': 'text/plain'});
  response.end("Direct response (e.g. {{ 'now' | date '%Y-%m-%d' }} isn't rendered)");
}

function liquid(request, response, next) {
  response.writeHead(200, {'Content-Type': 'application/liquid'});
  response.end("Rendered page for {{ shop.name }} at {{ 'now' | date: '%Y-%m-%d' }}");
}

function liquid_js(request, response, next) {
  response.writeHead(200, {'Content-Type': 'application/liquid'});
  response.end('{% layout none %}alert("{{ shop.name }}")');
}

function liquid_json(request, response, next) {
  response.writeHead(200, {'Content-Type': 'application/liquid'});
  response.end('{% layout none %}{ "shop": "{{ shop.name }}" }');
}

function html_script_tag(request, response, next) {
  response.writeHead(200, {'Content-Type': 'text/html'});
  response.end('<html><body><script type="text/javascript" src="/proxy/html.js"></script></body></html>');
}

function html_js(request, response, next) {
  response.writeHead(200, {'Content-Type': 'text/html'});
  response.end('alert("test")');
}

function alert_js(request, response, next) {
  response.writeHead(200, {'Content-Type': 'text/javascript'});
  response.end('alert("test")');
}

function chunked(request, response, next) {
  response.writeHead(200, {'Content-Type': 'application/liquid'});
  chunks = "Rendered page for {{ shop.name }} at {{ 'now' | date: '%Y-%m-%d' }}".split(" ");
  response.write(chunks[0]);
  for (var i = 1; i < chunks.length; i++) {
      response.write(" " + chunks[i]);
  }
  response.end()
}

function closeConnection(request, response, next) {
  response.useChunkedEncodingByDefault = false;
  response.writeHead(200, {'Content-Type': 'application/liquid'});
  chunks = "Rendered page for {{ shop.name }} at {{ 'now' | date: '%Y-%m-%d' }}".split(" ");
  response.write(chunks[0]);
  for (var i = 1; i < chunks.length; i++) {
      response.write(" " + chunks[i]);
  }
  response.end()
}

function echo(request, response, next) {
  response.writeHead(200, {'Content-Type': 'text/plain'});

  response.write(request.method + " /echo" + request.url + " HTTP/" + request.httpVersion + "\r\n");
  for (var name in request.headers) {
    response.write(name + ": " + request.headers[name] + "\r\n");
  }
  response.write("\r\n");
  request.pipe(response);
}

function notFound(request, response, next) {
  response.writeHead(404, {'Content-Type': 'text/plain'});
  response.end('App Page Not Found');
}

function redirect(request, response, next) {
  response.writeHead(301, {'Location': '/proxy/plain'});
  response.end('Temporarily Moved');
}

function moved(request, response, next) {
  response.writeHead(301, {'Location': '/proxy/liquid'});
  response.end('Permanently Moved');
}

function error(request, response, next) {
  response.writeHead(request.query.code || 500);
  response.end('Error');
}

function hangup(request, response, next) {
  response.destroy();
}

function slow(request, response, next) {
  var i, duration;
  response.writeHead(200, {'Content-Type': 'text/plain'});
  duration = +request.query.duration;
  i = 0;
  callback = function() {
    response.write(i.toString());
    i += 1;
    if (i > duration) {
      response.end();
    } else {
      setTimeout(callback, 1000);
    }
  };
  callback();
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
      redirect_uri: 'http://app-proxy-test2.herokuapp.com/install'
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
      shopifyRes.on('data', function(chunk){ buf += chunk; });
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
  app.use(connect.compress({'filter': function(req, res){ return true; }}));
  var proxy = connect();
  proxy.use('/liquid.json', liquid_json);
  proxy.use('/liquid.js', liquid_js);
  proxy.use('/html_script_tag', html_script_tag);
  proxy.use('/html.js', html_js);
  proxy.use('/alert.js', alert_js);
  proxy.use('/liquid', liquid);
  proxy.use('/chunked', chunked);
  proxy.use('/close', closeConnection);
  proxy.use('/echo', echo);
  proxy.use('/404', notFound);
  proxy.use('/redirect', redirect);
  proxy.use('/moved', moved);
  proxy.use('/error', error);
  proxy.use('/hangup', hangup);
  proxy.use('/slow', slow);
  proxy.use(plain);
  app.use("/proxy", proxy);
  app.use("/install", install);
  app.use("/", homepage);

  var s = http.createServer(app);
  s.listen(port, function() {
    console.log('Listening on ' + port);
  });
  return s;
}

if (require.main == module) {
  server(port);
}
