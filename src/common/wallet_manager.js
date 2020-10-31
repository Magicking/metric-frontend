import Web3 from 'web3'
import {MetamaskSubprovider} from "@0x/subproviders";
import {providerUtils} from "@0x/utils";
import {ContractWrappers} from "@0x/contract-wrappers";

let defaultWSUrl = "wss://mainnet.infura.io/ws/v3/12522e5176814bfda74dd672929641a3"

export let walletAddress = undefined

export function accountAddress() { return walletAddress }

export function isWalletConnected() {
    return (accountAddress() !== undefined)
}

export async function initWeb3(observer) {
    if (typeof Web3.givenProvider !== "undefined") {

        window.web3 = new Web3(Web3.givenProvider)
        await connectWallet();

        Web3.givenProvider.on("accountsChanged", (accounts) => {
            updateAccountAddressAndRefresh(accounts, observer)
        })

        console.log('connected wallet');

    } else {
        walletAddress = "0x0000000000000000000000000000000000000000"
        window.web3 = new Web3(new Web3.providers.WebsocketProvider(defaultWSUrl))
    }

    observer.update()

}

export async function connectWallet() {
    if (Web3.givenProvider !== undefined) {

        await Web3.givenProvider.enable().catch(error => {
            console.error(error)
        })

        let accounts = await window.web3.eth.getAccounts()
        updateAccountAddress(accounts)
    }
}

export function updateAccountAddress(accounts) {
    walletAddress = accounts[0]
}

function updateAccountAddressAndRefresh(accounts, observer) {
    updateAccountAddress(accounts)
    observer.update()
}

export function getProvider() {
    if (providerEngine === null) {
        initProvider()
    }
    return providerEngine
}

function initProvider() {
    providerEngine = new MetamaskSubprovider(window.web3.currentProvider)
}

export async function getContractWrapper() {
    if (contractWrapper === null) {
        let chainId = await providerUtils.getChainIdAsync(getProvider())
        contractWrapper = new ContractWrappers(getProvider(), {
            chainId: chainId,
        });
    }

    return contractWrapper
}

let providerEngine = null
let contractWrapper = null
