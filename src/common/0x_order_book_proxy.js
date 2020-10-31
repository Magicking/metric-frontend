import {HttpClient} from "@0x/connect";
import {getContractWrapper} from "./wallet_manager";

export function registerForOrderBookUpdateEvents(object) {
    callbacksRegister.push(object)
}

export function getReplayClient() {
    return relayClient
}

export function getOrderBookBids() {
    return bids
}

export function getOrderBookAsks() {
    return asks
}

export async function synchronizeOrderBook() {

    if (tokenCouple.quoteToken !== null && tokenCouple.baseToken !== null) {
        await updateOrderBook(tokenCouple.baseToken.address, tokenCouple.quoteToken.address)
    }

    setTimeout(synchronizeOrderBook, 1000)
}

export function setBaseToken(token) {
    tokenCouple.baseToken = token
}

export function setQuoteToken(token) {
    tokenCouple.quoteToken = token
}

export function getBaseToken() {
    return tokenCouple.baseToken
}

export function getQuoteToken() {
    return tokenCouple.quoteToken
}

async function updateOrderBook(baseTokenAddress, quoteTokenAddress) {
    let contractWrapper = await getContractWrapper()

    const baseAssetData =
        await contractWrapper.devUtils.encodeERC20AssetData(baseTokenAddress).callAsync();

    const quoteAssetData =
        await contractWrapper.devUtils.encodeERC20AssetData(quoteTokenAddress).callAsync();

    let orderBookUpdate = await relayClient.getOrderbookAsync(
        {
            baseAssetData: baseAssetData,
            quoteAssetData: quoteAssetData,
        }
    )

    bids = orderBookUpdate.bids.records
    asks = orderBookUpdate.asks.records

    callbacksRegister.forEach(obj => obj.update())
}


let bids = []
let asks = []

let tokenCouple = {
    baseToken: null,
    quoteToken: null
}

let relayClient = new HttpClient("https://api.0x.org/sra/v3")

let callbacksRegister = []
