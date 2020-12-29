# vex-js

nodejs for interfacing with xchat server. Use it for a client, a bot, whatever you'd like to conncet to vex.

<a href="https://vex-chat.github.io/libvex-js/">Documentation</a>

## Quickstart

```ts
export function initClient(): void {
    const PK = Client.generateSecretKey();
    client = new Client(PK, {
        dbFolder: progFolder,
        logLevel: "info",
    });
    client.on("ready", async () => {
        // you can retrieve users before you login
        const registeredUser = await client.users.retrieve(
            client.getKeys().public
        );
        if (registeredUser) {
            await client.login();
        } else {
            await client.register("MyUsername");
            await client.login();
        }
    });
    client.on("authed", async () => {
        const familiars = await client.users.familiars();
        for (const user of familiars) {
            client.messages.send(user.userID, "Hello world!");
        }
    });
    client.init();
}

initClient();
```

## Cryptography Notice

This distribution includes cryptographic software. The country in which you currently reside may have restrictions on the import, possession, use, and/or re-export to another country, of encryption software.
BEFORE using any encryption software, please check your country's laws, regulations and policies concerning the import, possession, or use, and re-export of encryption software, to see if this is permitted.
See <http://www.wassenaar.org/> for more information.

The U.S. Government Department of Commerce, Bureau of Industry and Security (BIS), has classified this software as Export Commodity Control Number (ECCN) 5D002.C.1, which includes information security software using or performing cryptographic functions with asymmetric algorithms.
The form and manner of this distribution makes it eligible for export under the License Exception ENC Technology Software Unrestricted (TSU) exception (see the BIS Export Administration Regulations, Section 740.13) for both object code and source code.
