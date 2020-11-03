import EthIcon from './eth.png'
import { accountAddress } from "./wallet_manager";
import { Erc20ContractProxy } from "./erc20_contract_proxy";

let tokens = [
    {
        address: "0x6e36556b3ee5aa28def2a8ec3dae30ec2b208739",
        decimals: 18,
        symbol: "BUILD",
        logoURI: "https://etherscan.io/token/images/build_32.png",
        balance: 0
    },
    {
        address: "0xEfc1C73A3D8728Dc4Cf2A18ac5705FE93E5914AC",
        decimals: 18,
        symbol: "METRIC",
        logoURI: "https://etherscan.io/images/main/empty-token.png",
        balance: 0
    },
    {
        address: "0xe1212f852c0ca3491CA6b96081Ac3Cf40e989094",
        decimals: 18,
        symbol: "HYPE",
        logoURI: "https://etherscan.io/images/main/empty-token.png",
        balance: 0
    },
    {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        decimals: 18,
        logoURI: EthIcon,
        balance: 0
    }
]

export function tokensList() { return tokens }

export async function fetchTokensBalances() {

    await Promise.all(
        tokens.map(async (t, index) => {
            let token = t
            token.balance = await fetchTokenBalance(token)
            tokens[index] = token
        })
    )

    setTimeout(fetchTokensBalances, 10000)
}

async function fetchTokenBalance(token) {

    let tokenBalance = 0

    if (token.symbol.toLowerCase() === "eth") {
        tokenBalance = await window.web3.eth.getBalance(accountAddress())
    } else {
        let contract = Erc20ContractProxy.erc20Contract(token.address)
        tokenBalance = await contract.methods.balanceOf(accountAddress()).call()
    }

    tokenBalance = isNaN(tokenBalance) ? 0 : tokenBalance / (10**token.decimals)

    return tokenBalance
}

export async function loadTokenList(observer)
{

    function handleErrors(response) {
        if (!response.ok) {
            throw Error(response.statusText);
        }
        return response;
    }

    await fetch("https://raw.githubusercontent.com/pro-blockchain-com/uniswap-token-list/4de4a4cfd348f7a745e7fec4ae8653e7f8e7d48d/tokens.1inch.eth.link.2020-09-05.json", {method: "GET"})
        .then(handleErrors)
        .then(r => r.json())
        .then(json => Array.from(json.tokens))
        .then(at => {
            at.forEach(t => {
                addToken({
                    balance: 0,
                    address: t.address,
                    symbol: t.symbol,
                    decimals: t.decimals,
                    logoURI: t.logoURI
                })
            })
        })
        .catch(_ => console.log("Token list retrieval failed"))

    observer.update()
}

export function addToken(token) {
    tokens.push(token)
}
