// SPDX-License-Identifier: MIT
// Test doubles for scripts/verify-trade-test.mjs only. Never deployed anywhere.
pragma solidity 0.8.28;
contract MockWETH {
    mapping(address => uint256) public balanceOf;
    function deposit() external payable { balanceOf[msg.sender] += msg.value; }
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function approve(address, uint256) external pure returns (bool) { return true; }
}
/// Takes 1% of every transfer.
contract MockFoT {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a - a / 100; return true; }
    function approve(address, uint256) external pure returns (bool) { return true; }
}
interface ICb { function uniswapV3SwapCallback(int256, int256, bytes calldata) external; }
interface IT { function balanceOf(address) external view returns (uint256); function transfer(address, uint256) external returns (bool); }
/// 1:1 price, exact input, checks it was paid like Uniswap v3 does.
contract MockV3Pool {
    address public token0; address public token1;
    function init(address a, address b) external { token0 = a; token1 = b; }
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160, bytes calldata data) external returns (int256 a0, int256 a1) {
        uint256 amt = uint256(amountSpecified);
        (address tin, address tout) = zeroForOne ? (token0, token1) : (token1, token0);
        IT(tout).transfer(recipient, amt);
        uint256 before = IT(tin).balanceOf(address(this));
        (a0, a1) = zeroForOne ? (int256(amt), -int256(amt)) : (-int256(amt), int256(amt));
        ICb(msg.sender).uniswapV3SwapCallback(a0, a1, data);
        require(IT(tin).balanceOf(address(this)) >= before + amt, "IIA");
    }
}
