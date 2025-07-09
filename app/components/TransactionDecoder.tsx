"use client";

import { useState, useEffect } from 'react';
import { Interface } from 'ethers';
import { decodeDeployData } from 'viem';

const TransactionDecoder = () => {
  // 保存的 ABI 列表，格式为 { name: string, abi: string }[]
  const [savedAbis, setSavedAbis] = useState<Array<{name: string, abi: string}>>([]);
  const [abi, setAbi] = useState('');
  const [abiName, setAbiName] = useState('');
  const [txData, setTxData] = useState('');
  const [functionName, setFunctionName] = useState('');
  const [decodedData, setDecodedData] = useState<any>(null);
  const [error, setError] = useState('');
  const [constructorData, setConstructorData] = useState('');
  const [bytecode, setBytecode] = useState('');
  const [decodedConstructor, setDecodedConstructor] = useState<any>(null);

  // 添加 useEffect 来处理客户端数据加载
  useEffect(() => {
    // 在客户端加载保存的数据
    const savedAbiList = JSON.parse(localStorage.getItem('abiList') || '[]');
    const currentAbi = localStorage.getItem('currentAbi') || '';
    
    setSavedAbis(savedAbiList);
    setAbi(currentAbi);
  }, []);

  const saveAbi = () => {
    if (!abiName.trim() || !abi.trim()) {
      setError('请输入 ABI 名称和内容');
      return;
    }

    const newAbiList = [...savedAbis, { name: abiName.trim(), abi }];
    setSavedAbis(newAbiList);
    localStorage.setItem('abiList', JSON.stringify(newAbiList));
    localStorage.setItem('currentAbi', abi);
    setAbiName('');
  };

  const selectAbi = (savedAbi: { name: string, abi: string }) => {
    setAbi(savedAbi.abi);
    localStorage.setItem('currentAbi', savedAbi.abi);
  };

  const deleteAbi = (index: number) => {
    const newAbiList = savedAbis.filter((_, i) => i !== index);
    setSavedAbis(newAbiList);
    localStorage.setItem('abiList', JSON.stringify(newAbiList));
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const abiContent = json.abi ? JSON.stringify(json.abi, null, 2) : text;
        
        // 使用文件名（去掉扩展名）作为 ABI 名称
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        
        // 直接保存 ABI
        const newAbiList = [...savedAbis, { name: fileName, abi: abiContent }];
        setSavedAbis(newAbiList);
        localStorage.setItem('abiList', JSON.stringify(newAbiList));
        localStorage.setItem('currentAbi', abiContent);
        setAbi(abiContent);
        
      } catch (err) {
        setError('文件解析失败：' + (err as Error).message);
      }
    }
  };

  const decodeTransaction = () => {
    try {
      setError('');
      const iface = new Interface(JSON.parse(abi));
      const decoded = iface.parseTransaction({ data: txData });
      
      if (!decoded) {
        setError('无法解析交易数据');
        return;
      }

      // 处理 BigInt 序列化问题
      const processArgs = (args: any): any => {
        if (Array.isArray(args)) {
          return args.map(processArgs);
        }
        if (typeof args === 'bigint') {
          return args.toString();
        }
        if (args && typeof args === 'object') {
          const processed: any = {};
          for (const key in args) {
            processed[key] = processArgs(args[key]);
          }
          return processed;
        }
        return args;
      };

      setDecodedData({
        name: decoded.name,
        signature: decoded.signature,
        args: processArgs(decoded.args),
      });
    } catch (err) {
      setError('解析失败：' + (err as Error).message);
    }
  };

  const decodeConstructor = () => {
    setError('');
    setDecodedConstructor(null);
    try {
      const abiJson = JSON.parse(abi);
      // viem 需要 ABI 为对象数组
      if (!Array.isArray(abiJson)) {
        setError('ABI 格式错误，需为数组');
        return;
      }
      if (!bytecode || !bytecode.startsWith('0x')) {
        setError('请正确填写合约 bytecode (0x...)');
        return;
      }
      // viem 的 decodeDeployData 要求 data、abi、bytecode
      const dataHex = (constructorData.startsWith('0x') ? constructorData : '0x' + constructorData) as `0x${string}`;
      // 仅解码参数时，bytecode 可传空字符串
      const decoded = decodeDeployData({ abi: abiJson, data: dataHex, bytecode: bytecode as `0x${string}` });
      setDecodedConstructor(decoded.args);
    } catch (err) {
      setError('Constructor 解析失败：' + (err as Error).message);
    }
  };

  const clearInputs = () => {
    setAbi('');
    setFunctionName('');
    setTxData('');
    setDecodedData(null);
    setError('');
  };

  return (
    <div className="flex">
      {/* 左侧 ABI 列表 */}
      <div className="w-64 p-4 border-r min-h-screen">
        <h3 className="text-lg font-bold mb-4">已保存的 ABI</h3>
        <div className="space-y-2">
          {(savedAbis || []).map((savedAbi, index) => (
            <div key={`abi-${index}`} className="flex items-center justify-between p-2 bg-gray-100 rounded">
              <button
                className="text-left flex-grow hover:text-blue-500"
                onClick={() => selectAbi(savedAbi)}
              >
                {savedAbi.name}
              </button>
              <button
                className="ml-2 text-red-500 hover:text-red-700"
                onClick={() => deleteAbi(index)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧主要内容 */}
      <div className="flex-grow p-4">
        <h2 className="text-2xl font-bold mb-4">交易数据解析器</h2>
        
        <div className="mb-4">
          <label className="block mb-2">合约 ABI:</label>
          <div 
            className="border-2 border-dashed border-gray-300 rounded p-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
          >
            <div className="flex gap-2">
              <textarea
                className="w-full p-2 border rounded"
                rows={5}
                value={abi}
                onChange={(e) => setAbi(e.target.value)}
                placeholder="请输入合约 ABI (JSON 格式) 或拖拽 JSON 文件到此处"
              />
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block mb-2">函数名称:</label>
          <input
            type="text"
            className="w-full p-2 border rounded"
            value={functionName}
            onChange={(e) => setFunctionName(e.target.value)}
            placeholder="请输入要调用的函数名称（可选）"
          />
        </div>

        <div className="mb-4">
          <label className="block mb-2">data:</label>
          <input
            type="text"
            className="w-full p-2 border rounded"
            value={txData}
            onChange={(e) => setTxData(e.target.value)}
            placeholder="请输入交易数据 (0x...)"
          />
        </div>

        <div className="flex gap-2">
          <button
            className="bg-blue-500 text-white px-4 py-2 rounded"
            onClick={decodeTransaction}
          >
            解析
          </button>
          <button
            className="bg-gray-500 text-white px-4 py-2 rounded"
            onClick={clearInputs}
          >
            清除
          </button>
        </div>

        {/* 解析 Constructor 部分 */}
        <div className="mb-4">
          <label className="block mb-2">Constructor 参数数据(CreationCode + constructorArgs bytecode):</label>
          <input
            type="text"
            className="w-full p-2 border rounded mb-2"
            value={constructorData}
            onChange={(e) => setConstructorData(e.target.value)}
            placeholder="请输入合约部署时的 constructor 参数 data (0x...)"
          />
          <label className="block mb-2">合约 Creation Bytecode:</label>
          <input
            type="text"
            className="w-full p-2 border rounded mb-2"
            value={bytecode}
            onChange={(e) => setBytecode(e.target.value)}
            placeholder="请输入合约 Bytecode (0x...)"
          />
          <button
            className="mt-2 bg-green-500 text-white px-4 py-2 rounded"
            onClick={decodeConstructor}
          >
            解析 Constructor
          </button>
        </div>

        {error && (
          <div className="mt-4 p-2 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {decodedData && (
          <div className="mt-4 p-4 bg-gray-100 rounded">
            <h3 className="font-bold">解析结果：</h3>
            <div className="mt-2">
              <p>函数名称: {decodedData.name}</p>
              <p>函数签名: {decodedData.signature}</p>
              <div className="mt-2">
                <p>参数:</p>
                <pre className="bg-gray-200 p-2 rounded mt-1">
                  {JSON.stringify(decodedData.args, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {decodedConstructor && (
          <div className="mt-4 p-4 bg-gray-100 rounded">
            <h3 className="font-bold">Constructor 解析结果：</h3>
            <pre className="bg-gray-200 p-2 rounded mt-1">
              {JSON.stringify(decodedConstructor, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionDecoder;