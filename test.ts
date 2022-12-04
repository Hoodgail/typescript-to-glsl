import { Compiler } from ".";

const code = `

    declare let time: Uniform<float>;

    function test(x: float, y: float): float {

        return x + y / time;
    };

`;

const parser = new Compiler(code);

console.log(
    parser.parse()
);
