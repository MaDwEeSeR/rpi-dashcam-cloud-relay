interface HasLength {
    length:number
}

export function isEmpty(val:HasLength|null|undefined) {
    return !val || val.length === 0;
}

export function stringCompare(a:string|null|undefined, b:string|null|undefined) {
    if (a == b) {
        return 0;
    }

    if (isEmpty(a)) {
        return -1;
    }

    if (isEmpty(b)) {
        return 1;
    }

    if (a! < b!) {
        return -1;
    }

    return 1;
}

export async function sleep(ms:number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}
