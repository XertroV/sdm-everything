export const snooze = async (ms: number) => new Promise((res, rej) => {
    try {
        setTimeout(res, ms);
    }  catch (e) {
        rej(e);
    }
});
