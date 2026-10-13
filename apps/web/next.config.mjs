const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** The browser only ever talks to this origin; /api is proxied server-side so cookies stay same-origin
 *  and no backend URL or secret reaches the client. */
export default {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};
