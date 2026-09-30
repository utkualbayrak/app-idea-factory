import { httpServerHandler } from "cloudflare:node";
import app from "./app";

app.listen(8080);

export default httpServerHandler({ port: 8080 });
