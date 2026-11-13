// 本文件只用于合成媒体回归，不能作为真实后续集取流通过的证据。
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
export async function installFixture(root, context, worker) {
  let expired = false;
  const executable =
    process.env.HG_FFMPEG ||
    execFileSync(
      "python",
      ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"],
      { encoding: "utf8" },
    ).trim();
  const file = path.join(root, "test-results/fixture.mp4");
  execFileSync(
    executable,
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=25",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "25",
      "-bf",
      "0",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      file,
    ],
    { stdio: "pipe" },
  );
  const bytes = await readFile(file);
  await context.route("**/hg-extension-fixture.mp4", async (route) => {
    if (expired) {
      expired = false;
      await route.fulfill({
        status: 403,
        body: "expired",
        headers: { "Access-Control-Allow-Origin": "*" },
      });
      return;
    }
    const range = /bytes=(\d+)-(\d+)/.exec(
      route.request().headers().range ?? "",
    );
    const start = Number(range?.[1] ?? 0),
      end = Math.min(bytes.length - 1, Number(range?.[2] ?? bytes.length - 1));
    await route.fulfill({
      status: range ? 206 : 200,
      body: bytes.subarray(start, end + 1),
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Range",
        "Cache-Control": "no-store",
      },
    });
  });
  await worker.evaluate(encoded => {
    const fixtureBytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    const original = self.fetch;
    self.fetch = async (raw, options) => {
      const url = new URL(String(raw)),
        json = (data) =>
          new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" },
          });
      if(url.pathname==='/service/2/device_register/')return json({device_id_str:'123456789',install_id_str:'987654321'});
      if(url.pathname==='/hg-extension-fixture.mp4'){
        if(self.fixtureExpired){self.fixtureExpired=false;return new Response('expired',{status:403});}
        const range=/bytes=(\d+)-(\d+)/.exec(new Headers(options.headers).get('Range')??'');const start=Number(range?.[1]??0),end=Math.min(fixtureBytes.length-1,Number(range?.[2]??fixtureBytes.length-1));return new Response(fixtureBytes.slice(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${fixtureBytes.length}`,'Content-Type':'video/mp4'}});
      }
      if (url.pathname.includes("/video_model/v1/"))
        if (self.fixtureModelError)
          return new Response("temporary", { status: 503 });
      if (url.pathname.includes("/video_model/v1/"))
        return json({
          data: {
            [url.searchParams.get("video_id")||JSON.parse(new TextDecoder().decode(options.body)).video_id]: {
              video_model: {
                fallback_api:
                  "https://v3-hgweb.qznovelvod.com/hg-extension-fixture-model",
              },
            },
          },
        });
      if (url.pathname === "/hg-extension-fixture-model")
        return json({
          video_info: {
            data: {
              video_list: {
                one: {
                  main_url:
                    "https://v3-hgweb.qznovelvod.com/hg-extension-fixture.mp4",
                  definition: "720p",
                  codec_type: "avc",
                  vwidth: 320,
                  vheight: 180,
                },
              },
            },
          },
        });
      return original(raw, options);
    };
  },bytes.toString('base64'));
  return {
    expireNext: () => {
      expired = true;
      return worker.evaluate(()=>{self.fixtureExpired=true;});
    },
  };
}
