// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/*
 * CRYPY trade test for Uniswap-v2-style exchanges (Uniswap v2, PancakeSwap v2, SushiSwap, Biswap and other forks).
 *
 * NEVER DEPLOYED. CRYPY runs this code only inside a read-only `eth_call`, placing it at a throwaway address with a
 * temporary test balance through the call's "state override". Nothing is signed, sent or stored on any chain.
 *
 * Steps: buy `amountIn` of the native coin's worth of the token, transfer 10% of it to a second address, then sell
 * the rest. Each step reports what the exchange promised and what actually arrived, so taxes can be measured, and
 * the first step that fails is reported with the contract's own error data.
 *
 * Build: scripts/build-trade-test.mjs (solc 0.8.28, optimizer 200 runs, via IR). The runtime bytecode is stored in
 * src/server/chains/evm/security/trade-test-v2.ts; a unit test checks the two stay in sync.
 */

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
}

interface IUniswapV2RouterMinimal {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

contract CrypyTradeTestV2 {
    uint8 internal constant OK = 0;
    uint8 internal constant QUOTE_FAILED = 1;
    uint8 internal constant BUY_FAILED = 2;
    uint8 internal constant BUY_NOTHING = 3;
    uint8 internal constant TRANSFER_FAILED = 4;
    uint8 internal constant APPROVE_FAILED = 5;
    uint8 internal constant SELL_FAILED = 6;

    struct Result {
        uint8 failedAt;
        bytes reason;
        uint256 buyExpected;
        uint256 buyReceived;
        uint256 buyGas;
        uint256 transferSent;
        uint256 transferReceived;
        uint256 sellAmount;
        uint256 sellExpected;
        uint256 sellReceived;
        uint256 sellGas;
    }

    receive() external payable {}

    function run(address router, address token, address wrapped, uint256 amountIn, address receiver)
        external
        returns (Result memory r)
    {
        IUniswapV2RouterMinimal dex = IUniswapV2RouterMinimal(router);
        address[] memory path = new address[](2);
        path[0] = wrapped;
        path[1] = token;

        try dex.getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
            r.buyExpected = amounts[1];
        } catch (bytes memory reason) {
            r.failedAt = QUOTE_FAILED;
            r.reason = reason;
            return r;
        }

        uint256 before = IERC20Minimal(token).balanceOf(address(this));
        uint256 gasStart = gasleft();
        try dex.swapExactETHForTokensSupportingFeeOnTransferTokens{value: amountIn}(
            0, path, address(this), block.timestamp + 600
        ) {} catch (bytes memory reason) {
            r.failedAt = BUY_FAILED;
            r.reason = reason;
            return r;
        }
        r.buyGas = gasStart - gasleft();
        r.buyReceived = IERC20Minimal(token).balanceOf(address(this)) - before;
        if (r.buyReceived == 0) {
            r.failedAt = BUY_NOTHING;
            return r;
        }

        // Transfer 10% to a second address: shows a transfer tax or a transfer block.
        r.transferSent = r.buyReceived / 10;
        uint256 receiverBefore = IERC20Minimal(token).balanceOf(receiver);
        (bool sent, bytes memory sentData) =
            token.call(abi.encodeWithSelector(0xa9059cbb, receiver, r.transferSent));
        if (!sent || (sentData.length > 0 && !abi.decode(sentData, (bool)))) {
            r.failedAt = TRANSFER_FAILED;
            r.reason = sentData;
            return r;
        }
        r.transferReceived = IERC20Minimal(token).balanceOf(receiver) - receiverBefore;

        // Sell everything left.
        r.sellAmount = IERC20Minimal(token).balanceOf(address(this));
        (bool approved, bytes memory approveData) =
            token.call(abi.encodeWithSelector(0x095ea7b3, router, type(uint256).max));
        if (!approved || (approveData.length > 0 && !abi.decode(approveData, (bool)))) {
            r.failedAt = APPROVE_FAILED;
            r.reason = approveData;
            return r;
        }
        path[0] = token;
        path[1] = wrapped;
        try dex.getAmountsOut(r.sellAmount, path) returns (uint256[] memory amounts) {
            r.sellExpected = amounts[1];
        } catch (bytes memory reason) {
            r.failedAt = SELL_FAILED;
            r.reason = reason;
            return r;
        }
        uint256 coinBefore = address(this).balance;
        gasStart = gasleft();
        try dex.swapExactTokensForETHSupportingFeeOnTransferTokens(
            r.sellAmount, 0, path, address(this), block.timestamp + 600
        ) {} catch (bytes memory reason) {
            r.failedAt = SELL_FAILED;
            r.reason = reason;
            return r;
        }
        r.sellGas = gasStart - gasleft();
        r.sellReceived = address(this).balance - coinBefore;
        r.failedAt = OK;
    }
}
