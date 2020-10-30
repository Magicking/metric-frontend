import {HttpClient} from "@0x/connect";
import {ZeroXOrdersProxy} from "./0x_orders_proxy"

export function getOrderBookBids() {
    return bids
}

export function getOrderBookAsks() {
    return asks
}

export async function synchronizeOrderBook() {

    if (tokenCouple.quoteTokenAddress !== null && tokenCouple.baseTokenAddress !== null) {
        await updateOrderBook(tokenCouple.baseTokenAddress, tokenCouple.quoteTokenAddress)
    }

    setTimeout(synchronizeOrderBook, 1000)
}

export function setBaseTokenAddress(address) {
    tokenCouple.baseTokenAddress = address
}

export function setQuoteTokenAddress(address) {
    tokenCouple.quoteTokenAddress = address
}

async function updateOrderBook(baseTokenAddress, quoteTokenAddress) {
    let contractWrapper = await ZeroXOrdersProxy.getContractWrapper()

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
}


let bids = []
let asks = []

let tokenCouple = {
    baseTokenAddress: null,
    quoteTokenAddress: null
}

let relayClient = new HttpClient("https://api.0x.org/sra/v3")
