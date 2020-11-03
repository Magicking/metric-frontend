import {BigNumber, providerUtils} from '@0x/utils';
import {orderFactory} from '@0x/order-utils/lib/src/order_factory';
import {accountAddress, getContractWrapper, getProvider} from './wallet_manager'
import {getContractAddressesForChainOrThrow} from "@0x/contract-addresses";
import {Erc20ContractProxy} from "./erc20_contract_proxy";
import {getBidsMatching, getReplayClient} from "./0x_order_book_proxy";

export const ZeroXOrdersProxy = {

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
    return (await getContractWrapper())
            .exchange
            .cancelOrder(order.order)
            .awaitTransactionSuccessAsync({ from: accountAddress() })
}

async function submitOrder(order, referralAddress, feePercentage) {

    let filledTakerAmount = await tryMatchOrder(order)
    let unfilledTakerAmount = order.takerAssetAmount.minus(filledTakerAmount)

    if (unfilledTakerAmount.isGreaterThan(0)) {

        let contractWrapper = await getContractWrapper()

        let unfilledMakerAmount =
            order.makerAssetAmount
                .multipliedBy(unfilledTakerAmount)
                .dividedBy(order.takerAssetAmount)

        const makerAssetData =
            await contractWrapper.devUtils.encodeERC20AssetData(order.makerAssetAddress).callAsync();

        const takerAssetData =
            await contractWrapper.devUtils.encodeERC20AssetData(order.takerAssetAddress).callAsync();

        let signedOrder = await orderFactory.createSignedOrderAsync(
            getProvider(),
            accountAddress(),
            unfilledMakerAmount,
            makerAssetData,
            unfilledTakerAmount,
            takerAssetData,
            await zeroXContractAddresses().then(a => a.exchange),
            {
                makerFee: (unfilledMakerAmount * feePercentage).toString(),
                takerFee: (unfilledTakerAmount * feePercentage).toString(),
                feeRecipientAddress: referralAddress,
            }
        )

        await getReplayClient().submitOrderAsync(signedOrder)
    }
}

async function tryMatchOrder(order) {

    let candidateFillOrders = await findCandidateOrders(order)

    let contractWrapper = await getContractWrapper()

    if (candidateFillOrders.length > 0) {

        let candidateFillOrdersTakerAmount = candidateFillOrders.map(o => o.takerAssetAmount)
        let candidateFillOrdersSignatures = candidateFillOrders.map(o => o.signature)

        let gasPriceWei = await window.web3.eth.getGasPrice()
        let protocolFeeMultiplier = await contractWrapper.exchange.protocolFeeMultiplier().callAsync()
        let callData = {
            from: accountAddress(),
            gasPrice: gasPriceWei,
            value: gasPriceWei * protocolFeeMultiplier.toNumber() * candidateFillOrders.length
        }

        let fillOrderFunction =
            await contractWrapper
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
    let limitOrderPrice = order.takerAssetAmount.dividedBy(order.makerAssetAmount)

    let orders = await getBidsMatching(order.makerAssetAddress, order.takerAssetAddress)

    let orderUnfilledAmount = order.takerAssetAmount
    let candidateFillOrders = []

    orders.forEach(bid => {
        let originalOrderFill = bid.order.makerAssetAmount
        let availableOrderPrice = originalOrderFill.dividedBy(bid.order.takerAssetAmount)
        let remainingUnfilledOrderAmount = new BigNumber(parseInt(bid.metaData.remainingFillableTakerAssetAmount))

        let fillablePart =
            originalOrderFill.multipliedBy(remainingUnfilledOrderAmount.dividedBy(bid.order.takerAssetAmount))

        if (availableOrderPrice.isGreaterThanOrEqualTo(limitOrderPrice) &&
            orderUnfilledAmount.isGreaterThan(0) &&
            fillablePart.isGreaterThan(0))
        {
            candidateFillOrders.push(bid.order)
            orderUnfilledAmount = orderUnfilledAmount.minus(BigNumber.min(fillablePart, orderUnfilledAmount))
        }
    })

    return candidateFillOrders
}

async function zeroXContractAddresses() {
    let chainId = await providerUtils.getChainIdAsync(getProvider())
    return getContractAddressesForChainOrThrow(chainId)
}
