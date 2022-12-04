import { parse } from "@typescript-eslint/parser";
import { type TSESTree, AST_NODE_TYPES } from '@typescript-eslint/types';

export enum GLSLType {
    float = "float",
    vec2 = "vec2",
    vec3 = "vec3",
    vec4 = "vec4",
    int = "int",
    matrix4 = "matrix4",
    sampler2D = "sampler2D",
    samplerCube = "samplerCube",
    sampler2DArray = "sampler2DArray",
    sampler2DShadow = "sampler2DShadow",
    void = "void",
    bool = "bool",
    Attribute = "attribute",
    Uniform = "uniform"
}

export const DEFAULT_TYPES = [
    ["vec2", "{ x: number, y: number }"],
    ["vec3", "{ x: number, y: number, z: number }"],
    ["vec4", "{ x: number, y: number, z: number, w: number }"],
    ["matrix4", "{ m11: number, m12: number, m13: number, m14: number, m21: number, m22: number, m23: number, m24: number, m31: number, m32: number, m33: number, m34: number, m41: number, m42: number, m43: number, m44: number }"],
    ["int", "number"],
    ["float", "number"],
    ["bool", "boolean"],
    ["sampler2D", "WebGLTexture"],
    ["samplerCube", "WebGLTexture"],
    ["sampler2DArray", "WebGLTexture"],
    ["sampler2DShadow", "WebGLTexture"],
    ["Uniform<X>", "X"],
    ["Attribute<X>", "X"],

].map(([glsl, ts]) => `type ${glsl} = ${ts}`).join(";");

export class UnsupportedTypeError extends TypeError {

    constructor(type: AST_NODE_TYPES) {

        super(`Unsupported type: ${type}`);
    }
}

export class MissingReturnTypeError extends TypeError {

    constructor() {

        super(`Missing return type`);
    }

}

export class Compiler {


    private static type(
        typeAnnotation?: TSESTree.TypeNode | TSESTree.TSTypeAnnotation | null | undefined
    ): GLSLType[keyof GLSLType] | undefined {

        if (typeAnnotation == null) throw new MissingReturnTypeError();

        switch (typeAnnotation.type) {

            case AST_NODE_TYPES.TSTypeReference: return "name" in typeAnnotation.typeName ? (GLSLType[typeAnnotation.typeName.name as keyof typeof GLSLType] || GLSLType.void) : GLSLType.void;

            case AST_NODE_TYPES.TSBooleanKeyword: return GLSLType.bool;

            case AST_NODE_TYPES.TSVoidKeyword: return GLSLType.void;

            default: throw new UnsupportedTypeError(typeAnnotation.type);
        }

    }

    private static typeParameters(typeParameters: TSESTree.TSTypeParameterInstantiation | TSESTree.TSTypeParameterDeclaration | null | undefined): string[] {

        if (!typeParameters) return [];

        let list: string[] = [];

        typeParameters.params.forEach((param) => {

            if (param.type == AST_NODE_TYPES.TSTypeReference) {

                if ("name" in param.typeName) list.push(param.typeName.name);
            }

        });

        return list
    }

    private static params(params: TSESTree.Parameter[]): string {

        let list: string[] = [];

        for (let param of params) {

            if (param.type == AST_NODE_TYPES.Identifier) {

                let type = Compiler.type(param.typeAnnotation?.typeAnnotation) ?? GLSLType.void;
                let name = param.name;

                list.push(`${type} ${name}`);
            }
        }

        return list.join(", ");
    };


    private static expression(code: TSESTree.Expression | TSESTree.PrivateIdentifier | TSESTree.CallExpressionArgument | null): string {

        if (!code) return "";

        switch (code.type) {

            case AST_NODE_TYPES.Identifier:

                return code.name;

            case AST_NODE_TYPES.CallExpression:

                let name = code.callee.type == AST_NODE_TYPES.Identifier ? code.callee.name : "";

                return `${name}(${code.arguments.map((arg) => Compiler.expression(arg)).join(", ")})`;

            case AST_NODE_TYPES.BinaryExpression:

                return `${Compiler.expression(code.left)} ${code.operator} ${Compiler.expression(code.right)}`;

            case AST_NODE_TYPES.Literal:

                return code.raw;

            default:

                return code.type;
        }
    }

    private static declare(node: TSESTree.VariableDeclaration) {

        let codes: string[] = [];

        if (node.type == AST_NODE_TYPES.VariableDeclaration) {

            node.declarations.forEach((declaration) => {

                if (declaration.type == AST_NODE_TYPES.VariableDeclarator) {

                    let type = Compiler.type(declaration.id.typeAnnotation?.typeAnnotation);
                    let name = declaration.id.type == AST_NODE_TYPES.Identifier ? declaration.id.name : "";
                    let typeParameters = declaration.id.typeAnnotation?.typeAnnotation && "typeParameters" in declaration.id.typeAnnotation?.typeAnnotation ? Compiler.typeParameters(declaration.id.typeAnnotation?.typeAnnotation?.typeParameters) : [];

                    if (typeParameters.length > 1) {

                        throw new Error("Too many type parameters");
                    }

                    if (typeParameters.length == 0) {

                        throw new Error("Missing a type parameter");
                    }

                    codes.push(`${type} ${typeParameters[0]} ${name};`);
                }
            });
        }

        return codes.join("\n");
    }


    private static traverse(node: TSESTree.ProgramStatement, codes: string[] = []) {

        switch (node.type) {

            case AST_NODE_TYPES.FunctionDeclaration:

                let returnType = Compiler.type(node.returnType?.typeAnnotation);
                let params = Compiler.params(node.params);
                let name = node.id.name;

                let block: string[] = [];

                block.push(`${returnType} ${name}(${params}) {`);

                node.body.body.forEach((node: TSESTree.Statement) => Compiler.traverse(node, block));

                block.push("}");

                codes.push(
                    block.join("\n")
                );

                break;

            case AST_NODE_TYPES.ReturnStatement:

                codes.push(`return ${Compiler.expression(node.argument)};`);

                break;

            case AST_NODE_TYPES.VariableDeclaration:

                codes.push(Compiler.declare(node));

                break;
        }
    }

    constructor(public code: string) { }

    public parse(code: string = this.code): string {

        const ast = parse(DEFAULT_TYPES + "\n" + code, { ecmaVersion: 2021, range: true, });

        let codes: string[] = [];

        ast.body.forEach((node: TSESTree.ProgramStatement) => Compiler.traverse(node, codes));

        return codes.join("\n");
    }
}

