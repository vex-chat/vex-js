import { sleep } from "@extrahash/sleep";
// tslint:disable-next-line: no-implicit-dependencies
import { Spire } from "@vex-chat/spire";
import fs from "fs";
import _ from "lodash";
import { Client, IChannel, IClientOptions, IMessage, IServer, IUser } from "..";
import { Storage } from "../Storage";

let spire: Spire | null = null;

beforeAll(() => {
    // spire = new Spire({
    //     dbType: "sqlite3mem",
    //     logLevel: "warn",
    // });
});

describe("Perform client tests", () => {
    const SK = Client.generateSecretKey();

    const clientOptions: IClientOptions = {
        inMemoryDb: false,
        logLevel: "info",
        dbLogLevel: "info",
        host: "localhost:16777",
        unsafeHttp: true,
    };

    const storage = new Storage(":memory:", SK, clientOptions);
    const client = new Client(SK, clientOptions, storage);

    let createdServer: IServer | null = null;
    let createdChannel: IChannel | null = null;

    const username = Client.randomUsername();
    const password = "hunter2";

    let userDetails: IUser | null = null;
    test("Register", async (done) => {
        client.on("ready", async () => {
            const [user, err] = await client.register(username, password);
            if (err) {
                throw err;
            }
            userDetails = user;
            expect(user!.username === username).toBe(true);
            done();
        });

        client.init();
    });

    test("Login", async (done) => {
        login(client, username, password);

        client.on("authed", async () => {
            done();
        });
    });

    test("Create a device", async (done) => {
        const NSK = Client.generateSecretKey();
        const newDevice = new Client(NSK, clientOptions);

        newDevice.on("ready", async () => {
            await newDevice.registerDevice(username, password);
            const err = await newDevice.login(username);
            if (err) {
                throw new Error(`${err}`);
            }
        });

        newDevice.on("authed", async () => {
            done();
        });

        newDevice.init();
    });

    test("Server operations", async (done) => {
        const server = await client.servers.create("Test Server");
        const serverList = await client.servers.retrieve();

        const [knownServer] = serverList;
        expect(server.serverID === knownServer.serverID).toBe(true);

        const retrieveByIDServer = await client.servers.retrieveByID(
            server.serverID
        );
        expect(server.serverID === retrieveByIDServer?.serverID).toBe(true);

        await client.servers.delete(server.serverID);

        // make another server to be used by channel tests
        createdServer = await client.servers.create("Channel Test Server");
        done();
    });

    test("Channel operations", async (done) => {
        const servers = await client.servers.retrieve();
        const [testServer] = servers;

        const channel = await client.channels.create(
            "Test Channel",
            testServer.serverID
        );

        await client.channels.delete(channel.channelID);

        const channels = await client.channels.retrieve(testServer.serverID);
        expect(channels.length).toBe(1);

        createdChannel = channels[0];

        const retrievedByIDChannel = await client.channels.retrieveByID(
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
                    done();
                }
            }
        };
        client.on("message", onMessage);

        const me = client.me.user();

        await client.messages.send(me.userID, "initial");
        await sleep(500);
        await client.messages.send(me.userID, "subsequent");
    });

    test("File operations", async (done) => {
        const createdFile = Buffer.alloc(1000);
        createdFile.fill(0);

        const [createdDetails, key] = await client.files.create(createdFile);
        const fetchedFileRes = await client.files.retrieve(
            createdDetails.fileID,
            key
        );
        if (!fetchedFileRes) {
            throw new Error("Error fetching file.");
        }

        const { data, details } = fetchedFileRes;

        expect(_.isEqual(createdFile, data)).toBe(true);
        expect(_.isEqual(createdDetails, details)).toBe(true);

        done();
    });

    test("Upload an avatar", async (done) => {
        const buf = fs.readFileSync("./src/__tests__/ghost.png");
        await client.me.setAvatar(buf);

        // const receivedFile = fs.readFileSync(
        //     "./avatars/" + client.me.user().userID
        // );

        // expect(receivedFile).toEqual(buf);

        done();
    });

    test("Group messaging", async (done) => {
        let received = 0;

        const onGroupMessage = (message: IMessage) => {
            if (!message.decrypted) {
                throw new Error("Message failed to decrypt.");
            }
            if (
                message.direction === "incoming" &&
                message.decrypted &&
                message.group !== null
            ) {
                console.log(message);
                received++;
                if (received === 2) {
                    client.off("message", onGroupMessage);
                    done();
                }
            }
        };

        client.on("message", onGroupMessage);

        const userIDs: string[] = [
            /*
            "71ab7ca2-ad89-4de4-90d3-455b32c24fbd",
            "acbc01dc-0207-40f8-b7ca-cded77a93bdf",
            "17e059c2-37fc-471e-9f4c-6fb0027263da",
         */
        ];
        for (const userID of userIDs) {
            await client.permissions.create({
                userID,
                resourceType: "server",
                resourceID: createdServer!.serverID,
            });
        }

        await client.messages.group(createdChannel!.channelID, "initial");
        await sleep(500);
        await client.messages.group(createdChannel!.channelID, "subsequent");
    });
});

afterAll(() => {
    const createdDirs = ["files", "avatars"];
    for (const dir of createdDirs) {
        fs.rmdirSync(dir, { recursive: true });
    }
    return spire?.close();
});

/**
 * @hidden
 */
const login = async (client: Client, username: string, password: string) => {
    const err = await client.login(username);
    if (err) {
        await client.close();
        throw new Error(err.message);
    }
};
