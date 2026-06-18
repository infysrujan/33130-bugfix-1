export default {
  plugins: [
    {
      name: 'api-proxy',
      apply: (server) => {
        server.middlewares.use('/api/fundpriceservice', async (req, res) => {
          const path = req.url || '';
          // AllFundsName lives on a different publish instance
          const host = path.toLowerCase().startsWith('/allfundsname')
            ? 'https://publish-p185039-e1938068.adobeaemcloud.com'
            : 'https://publish-p185039-e1937892.adobeaemcloud.com';
          const target = `${host}/api/FundPriceService${path}`;
          try {
            const response = await fetch(target);
            const data = await response.text();
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(data);
          } catch (e) {
            res.statusCode = 502;
            res.end('Proxy error');
          }
        });
      },
    },
  ],
};
