export const snooze = async (ms: number) => new Promise((res, rej) => {
    try {
        setTimeout(res, ms);
    }  catch (e) {
        rej(e);
    }
});


export const jSz = (thing: any) => JSON.stringify(thing);

export const jUnsz = (s: string) => JSON.parse(s);
