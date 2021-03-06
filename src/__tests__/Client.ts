import { sleep } from "@extrahash/sleep";
// tslint:disable-next-line: no-implicit-dependencies
import fs from "fs";
import _ from "lodash";
import { Client, IChannel, IClientOptions, IMessage, IServer, IUser } from "..";

let clientA: Client | null = null;

const clientOptions: IClientOptions = {
    inMemoryDb: true,
    logLevel: "error",
    dbLogLevel: "error",
    // host: "localhost:16777",
    // unsafeHttp: true,
};

beforeAll(async () => {
    const SK = Client.generateSecretKey();

    clientA = await Client.create(SK, clientOptions);
    if (!clientA) {
        throw new Error("Couldn't create client.");
    }
});

describe("Perform client tests", () => {
    let createdServer: IServer | null = null;
    let createdChannel: IChannel | null = null;

    const username = Client.randomUsername();
    const password = "hunter2";

    let userDetails: IUser | null = null;
    test("Register", async (done) => {
        const [user, err] = await clientA!.register(username, password);
        if (err) {
            throw err;
        }
        userDetails = user;
        expect(user!.username === username).toBe(true);
        done();
    });

    test("Login", () => {
        return login(clientA!, username, password);
    });

    test("Connect", async (done) => {
        clientA!.on("connected", () => {
            done();
        });

        await clientA!.connect();
    });

    test("Server operations", async (done) => {
        const permissions = await clientA!.permissions.retrieve();
        expect(permissions).toEqual([]);

        const server = await clientA!.servers.create("Test Server");
        const serverList = await clientA!.servers.retrieve();
        const [knownServer] = serverList;
        expect(server.serverID).toBe(knownServer.serverID);

        const retrieveByIDServer = await clientA!.servers.retrieveByID(
            server.serverID
        );
        expect(server.serverID).toEqual(retrieveByIDServer?.serverID);

        await clientA!.servers.delete(server.serverID);

        // make another server to be used by channel tests
        createdServer = await clientA!.servers.create("Channel Test Server");
        done();
    });

    test("Channel operations", async (done) => {
        const servers = await clientA!.servers.retrieve();
        const [testServer] = servers;

        const channel = await clientA!.channels.create(
            "Test Channel",
            testServer.serverID
        );

        await clientA!.channels.delete(channel.channelID);

        const channels = await clientA!.channels.retrieve(testServer.serverID);
        expect(channels.length).toBe(1);

        createdChannel = channels[0];

        const retrievedByIDChannel = await clientA!.channels.retrieveByID(
            channels[0].channelID
        );
        expect(channels[0].channelID === retrievedByIDChannel?.channelID).toBe(
            true
        );
        done();
    });

    test("Direct messaging", async (done) => {
        const received: string[] = [];

        const receivedAllExpected = () =>
            received.includes("initial") && received.includes("subsequent");

        const onMessage = (message: IMessage) => {
            if (!message.decrypted) {
                throw new Error("Message failed to decrypt.");
            }
            if (
                message.direction === "incoming" &&
                message.decrypted &&
                message.group === null
            ) {
                received.push(message.message);
                if (receivedAllExpected()) {
                    clientA!.off("message", onMessage);
                    done();
                }
            }
        };
        clientA!.on("message", onMessage);

        const me = clientA!.me.user();

        await clientA!.messages.send(me.userID, "initial");
        await sleep(500);
        await clientA!.messages.send(me.userID, "subsequent");
    });

    test("File operations", async (done) => {
        const createdFile = Buffer.alloc(1000);
        createdFile.fill(0);

        const [createdDetails, key] = await clientA!.files.create(createdFile);
        const fetchedFileRes = await clientA!.files.retrieve(
            createdDetails.fileID,
            key
        );
        if (!fetchedFileRes) {
            throw new Error("Error fetching file.");
        }

        const { data, details } = fetchedFileRes;

        expect(_.isEqual(createdFile, data)).toBe(true);
        expect(_.isEqual(createdDetails.nonce, details.nonce)).toBe(true);

        done();
    });

    test("Upload an emoji", async (done) => {
        const buf = fs.readFileSync("./src/__tests__/triggered.png");
        const emoji = await clientA!.emoji.create(
            buf,
            "triggered",
            createdServer!.serverID
        );
        if (!emoji) {
            throw new Error("Couldn't create emoji.");
        }
        const list = await clientA?.emoji.retrieveList(createdServer!.serverID);
        expect([emoji]).toEqual(list);
        done();
    });

    test("Upload an avatar", async (done) => {
        const buf = fs.readFileSync("./src/__tests__/ghost.png");
        await clientA!.me.setAvatar(buf);
        done();
    });

    test("Create invite", async (done) => {
        if (!createdServer) {
            throw new Error("Server not created, can't do invite test.");
        }

        const invite = await clientA!.invites.create(
            createdServer.serverID,
            "1h"
        );
        await clientA?.invites.redeem(invite.inviteID);

        const serverInviteList = await clientA?.invites.retrieve(
            createdServer.serverID
        );
        done();
    });

    test("Group messaging", async (done) => {
        const received: string[] = [];

        const receivedAllExpected = () =>
            received.includes("initial") && received.includes("subsequent");

        const onGroupMessage = (message: IMessage) => {
            if (!message.decrypted) {
                throw new Error("Message failed to decrypt.");
            }
            if (
                message.direction === "incoming" &&
                message.decrypted &&
                message.group !== null
            ) {
                received.push(message.message);
                if (receivedAllExpected()) {
                    done();
                }
            }
        };

        clientA!.on("message", onGroupMessage);

        await clientA!.messages.group(createdChannel!.channelID, "initial");
        await sleep(500);
        await clientA!.messages.group(createdChannel!.channelID, "subsequent");
    });

    test("Message history operations", async (done) => {
        const history = await clientA?.messages.retrieve(
            clientA.me.user().userID
        );
        if (!history) {
            throw new Error("No history found!");
        }

        await clientA?.messages.delete(clientA.me.user().userID);

        const postHistory = await clientA?.messages.retrieve(
            clientA.me.user().userID
        );
        expect(postHistory?.length).toBe(0);
        done();
    });

    // TODO: running multiple instances of the client introduces bugs.
    // cookies get overwritten for all three when you set the device or user cookie.
    // find out how to fix this.

    // test("Register a second device", async (done) => {
    //     jest.setTimeout(10000);
    //     const clientB = await Client.create(undefined, {
    //         ...clientOptions,
    //         logLevel: "info",
    //     });
    //     await clientB.login(username, password);
    //     await clientB.connect();

    //     clientB.on("message", (message) => console.log(message))

    //     const otherUsername = Client.randomUsername();
    //     const otherUser = await Client.create(undefined, clientOptions);
    //     await otherUser.register(otherUsername, password);
    //     await otherUser.login(otherUsername, password);
    //     await otherUser.connect();

    //     await sleep(1000);

    //     const received: string[] = [];
    //     const receivedAllExpected = () => {
    //         console.log(received);
    //         return (
    //             received.includes("initialA") &&
    //             received.includes("initialB") &&
    //             received.includes("subsequentA") &&
    //             received.includes("subsequentB") &&
    //             received.includes("forwardInitialB") &&
    //             received.includes("forwardSubsequentB")
    //         );
    //     };

    //     clientB.on("message", (message) => {
    //         received.push(message.message + "B");
    //         if (receivedAllExpected()) {
    //             done();
    //         }
    //     });

    //     clientA?.on("message", (message) => {
    //         if (
    //             message.direction === "incoming" ||
    //             message.authorID === clientA?.me.user().userID
    //         ) {
    //             received.push(message.message + "A");
    //             if (receivedAllExpected()) {
    //                 done();
    //             }
    //         }
    //     });

    //     otherUser.messages.send(clientA!.me.user().userID, "initial");
    //     await sleep(500);
    //     otherUser.messages.send(clientA!.me.user().userID, "subsequent");
    //     await sleep(500);
    //     clientA!.messages.send(otherUser!.me.user().userID, "forwardInitial");
    //     await sleep(500);
    //     clientA!.messages.send(
    //         otherUser!.me.user().userID,
    //         "forwardSubsequent"
    //     );
    // });
});

/**
 * @hidden
 */
const login = async (client: Client, username: string, password: string) => {
    const err = await client.login(username, password);
    if (err) {
        console.error(JSON.stringify(err));
        await client.close();
        throw new Error(err.toString());
    }
};
