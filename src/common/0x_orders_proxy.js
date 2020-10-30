import {Orderbook} from "@0x/orderbook";
import {BigNumber, providerUtils } from '@0x/utils';
import {orderFactory} from '@0x/order-utils/lib/src/order_factory';
import {assetDataUtils} from '0x.js'
import {accountAddress} from './wallet_manager'
import {getContractAddressesForChainOrThrow} from "@0x/contract-addresses";
import {Erc20ContractProxy} from "./erc20_contract_proxy";
import {ContractWrappers} from "@0x/contract-wrappers"
import { Web3Wrapper } from '@0x/web3-wrapper';
import { MetamaskSubprovider } from '@0x/subproviders';

export const ZeroXOrdersProxy = {

    get0xMeshOrderBook: function() { return orderBook },

    is0xApprovedForToken: async function(address, amount) {
        let zeroXAllowanceTargetAddress = await zeroXContractAddresses().then(a => a.erc20Proxy)
        return await Erc20ContractProxy.isAddressApprovedForToken(zeroXAllowanceTargetAddress, address, amount)
    },

    approveZeroXAllowance: async function(tokenAddress) {
        let zeroXAllowanceTargetAddress = await zeroXContractAddresses().then(a => a.erc20Proxy)
        await Erc20ContractProxy.approveTokenForTargetAddress(tokenAddress, zeroXAllowanceTargetAddress)
    },

    submitOrder: submitOrder,

    cancelOrder: cancelOrder
}

async function cancelOrder(order) {
    let chainId = await providerUtils.getChainIdAsync(getProvider())
    let contractWrappers = new ContractWrappers(getProvider(), {
        chainId: chainId,
    });

    return contractWrappers.exchange
            .cancelOrder(order.order)
            .awaitTransactionSuccessAsync({ from: accountAddress() })
}

async function submitOrder(order, referralAddress, feePercentage) {

    let filledTakerAmount = await tryMatchOrder(order)
    let unfilledTakerAmount = order.takerAssetAmount.minus(filledTakerAmount)

    if (unfilledTakerAmount.isGreaterThan(0)) {

        let unfilledMakerAmount =
            order.makerAssetAmount
                .multipliedBy(unfilledTakerAmount)
                .dividedBy(order.takerAssetAmount)

        let signedOrder = await orderFactory.createSignedOrderAsync(
            getProvider(),
            accountAddress(),
            unfilledMakerAmount,
            assetDataUtils.encodeERC20AssetData(order.makerAssetAddress),
            unfilledTakerAmount,
            assetDataUtils.encodeERC20AssetData(order.takerAssetAddress),
            await zeroXContractAddresses().then(a => a.exchange),
            {
                makerFee: (unfilledMakerAmount * feePercentage).toString(),
                takerFee: (unfilledTakerAmount * feePercentage).toString(),
                feeRecipientAddress: referralAddress,
            }
        )

        await orderBook.addOrdersAsync([signedOrder])
    }
}

async function tryMatchOrder(order) {
    let chainId = await providerUtils.getChainIdAsync(getProvider())
    let contractWrappers = new ContractWrappers(getProvider(), {
        chainId: chainId,
    });
    let web3Wrapper = new Web3Wrapper(getProvider())

    let candidateFillOrders = await findCandidateOrders(order)

    if (candidateFillOrders.length > 0) {

        let candidateFillOrdersTakerAmount = candidateFillOrders.map(o => o.takerAssetAmount)
        let candidateFillOrdersSignatures = candidateFillOrders.map(o => o.signature)

        let gasPriceWei = await window.web3.eth.getGasPrice()
        let protocolFeeMultiplier = await contractWrappers.exchange.protocolFeeMultiplier().callAsync()
        let callData = {
            from: accountAddress(),
            gasPrice: gasPriceWei,
            value: gasPriceWei * protocolFeeMultiplier.toNumber() * candidateFillOrders.length
        }

        let fillOrderFunction =
            await contractWrappers
                .exchange
                .batchFillOrdersNoThrow(
                    candidateFillOrders,
                    candidateFillOrdersTakerAmount,
                    candidateFillOrdersSignatures
                )

        let fillResults = await fillOrderFunction.callAsync(callData)
        let receipt = await fillOrderFunction.awaitTransactionSuccessAsync(callData);

        if (receipt.status === 1 && fillResults.length > 0) {
            return fillResults.map(l => l.makerAssetFilledAmount).reduce((a,b) => BigNumber.sum(a, b))
        }
    }

    return new BigNumber(0)
}

async function findCandidateOrders(order) {

    let limitOrderPrice = order.makerAssetAmount.dividedBy(order.takerAssetAmount)
    let orders = await orderBook.getOrdersAsync(
        assetDataUtils.encodeERC20AssetData(order.takerAssetAddress),
        assetDataUtils.encodeERC20AssetData(order.makerAssetAddress)
    )

    let orderUnfilledAmount = order.takerAssetAmount
    let candidateFillOrders = []

    orders.forEach(bid => {
        let availableOrderPrice = bid.order.takerAssetAmount.dividedBy(bid.order.makerAssetAmount)
        let availableOrderFill = bid.order.makerAssetAmount
        let remainingUnfilledOrderAmount = new BigNumber(parseInt(bid.metaData.remainingFillableTakerAssetAmount))

        if (remainingUnfilledOrderAmount.isEqualTo(bid.order.takerAssetAmount)) {

            if (availableOrderPrice.isLessThanOrEqualTo(limitOrderPrice) &&
                availableOrderFill.isLessThanOrEqualTo(orderUnfilledAmount))
            {
                candidateFillOrders.push(bid.order)
                orderUnfilledAmount = orderUnfilledAmount.minus(availableOrderFill)
            }
        }
    })

    return candidateFillOrders
}

function initOrderBook() {
    return Orderbook.getOrderbookForPollingProvider({
        httpEndpoint : "https://api.0x.org/sra/v3",
        pollingIntervalMs: 10000
    })
}

function initProvider() {
    providerEngine = new MetamaskSubprovider(window.web3.currentProvider)
}

async function zeroXContractAddresses() {
    let chainId = await providerUtils.getChainIdAsync(getProvider())
    return getContractAddressesForChainOrThrow(chainId)
}

function getProvider() {
    if (providerEngine === null) {
        initProvider()
    }
    return providerEngine
}

let orderBook = initOrderBook()
let providerEngine = null
