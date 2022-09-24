import { resolve } from "node:path"
import { Client } from "./server"

(async () => {
    const client = new Client()
    await client.start()

    client.openFile({ file: resolve("./src/server.ts") })
    const typeInfo = await client.quickInfo({ file: resolve("./src/server.ts"), line: 21, offset: 6 }).catch((e) => e)

    console.log(typeInfo)

    client.stop()
})()