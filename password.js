// 使用立即执行函数来创建闭包，避免变量污染全局作用域
(function() {
    // 更简单的密码混淆方式
    const _0x1337 = [
        String.fromCharCode(49), // 1
        String.fromCharCode(49), // 1
        String.fromCharCode(52), // 4
        String.fromCharCode(53), // 5
        String.fromCharCode(49), // 1
        String.fromCharCode(52), // 4
        String.fromCharCode(49), // 1
        String.fromCharCode(57), // 9
        String.fromCharCode(49), // 1
        String.fromCharCode(57), // 9
        String.fromCharCode(56), // 8
        String.fromCharCode(49), // 1
        String.fromCharCode(48)  // 0
    ];
    
    // 验证函数
    function verifyPassword(input) {
        const correctPassword = _0x1337.join('');
        console.log('Attempting to verify password...'); // 调试用
        return input === correctPassword;
    }

    // 初始化页面
    function initPasswordProtection() {
        document.body.style.visibility = 'hidden';
        window.readerInitialized = false;
        
        const loginDiv = document.createElement('div');
        loginDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 10000;
            text-align: center;
            visibility: visible;
        `;

        loginDiv.innerHTML = `
            <h2 style="margin-bottom: 20px;">请输入密码</h2>
            <input type="password" id="passwordInput" style="
                padding: 8px;
                margin-bottom: 10px;
                width: 200px;
                border: 1px solid #ddd;
                border-radius: 4px;
            ">
            <br>
            <button id="submitPassword" style="
                padding: 8px 16px;
                background: #007AFF;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            ">确认</button>
        `;

        document.body.appendChild(loginDiv);

        const input = document.getElementById('passwordInput');
        const button = document.getElementById('submitPassword');

        const handleSubmit = () => {
            const inputValue = input.value;
            if (verifyPassword(inputValue)) {
                loginDiv.remove();
                document.body.style.visibility = 'visible';
                sessionStorage.setItem('authenticated', 'true');
                
                setTimeout(() => {
                    window.readerInitialized = true;
                    const event = new Event('passwordVerified');
                    document.dispatchEvent(event);
                }, 100);
            } else {
                // 密码错误
                input.style.borderColor = 'red';
                input.value = '';
                input.placeholder = '密码错误';
                setTimeout(() => {
                    input.style.borderColor = '#ddd';
                    input.placeholder = '';
                }, 1000);
            }
        };

        button.addEventListener('click', handleSubmit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        });
    }

    // 检查是否已经验证过
    function checkAuthentication() {
        if (!sessionStorage.getItem('authenticated')) {
            initPasswordProtection();
        } else {
            document.body.style.visibility = 'visible';
            setTimeout(() => {
                window.readerInitialized = true;
                const event = new Event('passwordVerified');
                document.dispatchEvent(event);
            }, 100);
        }
    }

    // 页面加载完成后执行验证
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAuthentication);
    } else {
        checkAuthentication();
    }
})(); 