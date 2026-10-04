import { execFile } from "node:child_process";
let active = 0;
// Only validated WMS parameters and a server-selected project reach this renderer.
export async function renderQgisCgi(command, params) {
  if (active >= 2) throw Error("QGIS render queue is busy");
  active++;
  try {
    return await new Promise((resolve, reject) => {
      execFile(command, [], {
        timeout: 25000, maxBuffer: 24 * 1024 * 1024, encoding: "buffer",
        // Do not pass the hosting process's database/session secrets to CGI.
        env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", QT_QPA_PLATFORM: "offscreen",
          REQUEST_METHOD: "GET", QUERY_STRING: params.toString(),
          SERVER_NAME: "localhost", SERVER_PROTOCOL: "HTTP/1.1",
          SCRIPT_NAME: "/ows", REQUEST_URI: "/ows?" + params,
        },
      }, (error, stdout) => {
        if (error) return reject(Error("QGIS renderer unavailable"));
        const split = stdout.indexOf("\r\n\r\n");
        const fallback = stdout.indexOf("\n\n");
        const offset = split >= 0 ? split + 4 : fallback >= 0 ? fallback + 2 : -1;
        const body = stdout.subarray(offset);
        if (offset < 0 || !body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
          return reject(Error("QGIS did not return a PNG"));
        resolve(body);
      });
    });
  } finally { active--; }
}
