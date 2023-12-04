import React, { useState, useRef, useImperativeHandle, useEffect } from 'react';
import classNames from 'classnames';
import {
  BrowseIcon as TdBrowseIcon,
  BrowseOffIcon as TdBrowseOffIcon,
  CloseCircleFilledIcon as TdCloseCircleFilledIcon,
} from 'tdesign-icons-react';
import isFunction from 'lodash/isFunction';
import useLayoutEffect from '../_util/useLayoutEffect';
import forwardRefWithStatics from '../_util/forwardRefWithStatics';
import useConfig from '../hooks/useConfig';
import useGlobalIcon from '../hooks/useGlobalIcon';
import { TdInputProps } from './type';
import { StyledProps, TNode, TElement } from '../common';
import InputGroup from './InputGroup';
import useControlled from '../hooks/useControlled';
import { useLocaleReceiver } from '../locale/LocalReceiver';
import { inputDefaultProps } from './defaultProps';
import parseTNode from '../_util/parseTNode';
import useLengthLimit from './useLengthLimit';
import useDefaultProps from '../hooks/useDefaultProps';

export interface InputProps extends TdInputProps, StyledProps {
  showInput?: boolean; // 控制透传readonly同时是否展示input 默认保留 因为正常Input需要撑开宽度
  keepWrapperWidth?: boolean; // 控制透传autoWidth之后是否容器宽度也自适应 多选等组件需要用到自适应但也需要保留宽度
}

export interface InputRef extends React.RefObject<unknown> {
  currentElement: HTMLDivElement;
  inputElement: HTMLInputElement;
  focus: () => void;
  blur: () => void;
  select: () => void;
}

type InputContextTrigger = 'input' | 'clear' | 'initial';

const renderIcon = (classPrefix: string, type: 'prefix' | 'suffix', icon: TNode | TElement) => {
  const result = parseTNode(icon);

  const iconClassName = icon ? `${classPrefix}-input__${type}-icon` : '';

  return result ? <span className={`${classPrefix}-input__${type} ${iconClassName}`}>{result}</span> : null;
};

const Input = forwardRefWithStatics(
  (originalProps: InputProps, ref: React.RefObject<InputRef>) => {
    // 国际化文本初始化
    const [local, t] = useLocaleReceiver('input');
    const { BrowseIcon, BrowseOffIcon, CloseCircleFilledIcon } = useGlobalIcon({
      BrowseIcon: TdBrowseIcon,
      BrowseOffIcon: TdBrowseOffIcon,
      CloseCircleFilledIcon: TdCloseCircleFilledIcon,
    });
    const props = useDefaultProps<InputProps>(originalProps, inputDefaultProps);
    const {
      type,
      autoWidth,
      placeholder = t(local.placeholder),
      disabled,
      status,
      size,
      className,
      inputClass,
      style,
      prefixIcon,
      suffixIcon,
      clearable,
      tips,
      align,
      maxlength,
      maxcharacter,
      showClearIconOnEmpty,
      autofocus,
      autocomplete,
      readonly,
      label,
      suffix,
      showInput = true,
      keepWrapperWidth,
      showLimitNumber,
      allowInputOverMax,
      name,
      format,
      onClick,
      onClear,
      onEnter,
      onKeydown,
      onKeyup,
      onKeypress,
      onFocus,
      onBlur,
      onPaste,
      onMouseenter,
      onMouseleave,
      onWheel,
      onCompositionstart,
      onCompositionend,
      onValidate,
      onChange: onChangeFromProps,
      ...restProps
    } = props;

    const [value, onChange] = useControlled(props, 'value', onChangeFromProps);
    const { limitNumber, getValueByLimitNumber, tStatus } = useLengthLimit({
      value: value === undefined ? undefined : String(value),
      status,
      maxlength,
      maxcharacter,
      allowInputOverMax,
      onValidate,
    });

    const { classPrefix } = useConfig();
    const composingRef = useRef(false);
    const inputRef: React.RefObject<HTMLInputElement> = useRef();
    // inputPreRef 用于预存输入框宽度，应用在 auto width 模式中
    const inputPreRef: React.RefObject<HTMLInputElement> = useRef();
    const wrapperRef: React.RefObject<HTMLDivElement> = useRef();
    const [isHover, toggleIsHover] = useState(false);
    const [isFocused, toggleIsFocused] = useState(false);
    const [renderType, setRenderType] = useState(type);

    const [composingValue, setComposingValue] = useState<string>('');
    const isShowClearIcon = ((clearable && value && !disabled) || showClearIconOnEmpty) && isHover;

    const prefixIconContent = renderIcon(classPrefix, 'prefix', parseTNode(prefixIcon));
    let suffixIconNew = suffixIcon;

    if (isShowClearIcon)
      suffixIconNew = (
        <CloseCircleFilledIcon
          className={`${classPrefix}-input__suffix-clear`}
          onMouseDown={handleMouseDown}
          onClick={handleClear}
        />
      );
    if (type === 'password' && typeof suffixIcon === 'undefined') {
      if (renderType === 'password') {
        suffixIconNew = (
          <BrowseOffIcon className={`${classPrefix}-input__suffix-clear`} onClick={togglePasswordVisible} />
        );
      } else if (renderType === 'text') {
        suffixIconNew = <BrowseIcon className={`${classPrefix}-input__suffix-clear`} onClick={togglePasswordVisible} />;
      }
    }

    const suffixIconContent = renderIcon(classPrefix, 'suffix', parseTNode(suffixIconNew));
    const labelContent = isFunction(label) ? label() : label;
    const suffixContent = isFunction(suffix) ? suffix() : suffix;
    const limitNumberNode =
      limitNumber && showLimitNumber ? (
        <div
          className={classNames(`${classPrefix}-input__limit-number`, {
            [`${classPrefix}-is-disabled`]: disabled,
          })}
        >
          {limitNumber}
        </div>
      ) : null;

    const updateInputWidth = () => {
      if (!autoWidth || !inputRef.current) return;
      const { offsetWidth } = inputPreRef.current;
      const { width } = inputPreRef.current.getBoundingClientRect();
      // 异步渲染场景下 getBoundingClientRect 宽度为 0，需要使用 offsetWidth
      const calcWidth = width < offsetWidth ? offsetWidth + 1 : width;
      inputRef.current.style.width = `${calcWidth}px`;
    };

    useLayoutEffect(() => {
      // 推迟到下一帧处理防止异步渲染 input 场景宽度计算为 0
      requestAnimationFrame(() => {
        updateInputWidth();
      });
      // eslint-disable-next-line
    }, [autoWidth, value, placeholder, inputRef, composingValue]);

    // 当元素默认为 display: none 状态，无法提前准确计算宽度，因此需要监听元素宽度变化。比如：Tabs 场景切换。
    useEffect(() => {
      let resizeObserver: ResizeObserver = null;
      // IE 11 以下使用设置 minWidth 兼容；IE 11 以上使用 ResizeObserver
      if (typeof window.ResizeObserver === 'undefined' || !inputRef.current) return;
      resizeObserver = new window.ResizeObserver(() => {
        updateInputWidth();
      });
      resizeObserver.observe(inputRef.current);
      return () => {
        // resizeObserver.unobserve?.(inputRef.current);
        resizeObserver.disconnect?.();
        resizeObserver = null;
      };
      // eslint-disable-next-line
    }, [inputRef]);

    useEffect(() => {
      setRenderType(type);
    }, [type]);

    // 初始判断长度，如超限自动截断并触发onchange
    useEffect(() => {
      if (value) {
        const limitedValue = getValueByLimitNumber(value);
        if (limitedValue.length !== value.length && !allowInputOverMax) {
          onChange?.(limitedValue, { trigger: 'initial' });
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const innerValue = composingRef.current ? composingValue : value ?? '';
    const formatDisplayValue = format && !isFocused ? format(innerValue) : innerValue;

    const renderInput = (
      <input
        ref={inputRef}
        placeholder={placeholder}
        type={renderType}
        className={`${classPrefix}-input__inner`}
        value={formatDisplayValue}
        readOnly={readonly}
        disabled={disabled}
        autoComplete={autocomplete ?? (local.autocomplete || undefined)}
        autoFocus={autofocus}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onKeyPress={handleKeyPress}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        name={name}
        maxLength={maxlength && !allowInputOverMax ? maxlength : null}
      />
    );

    const renderInputNode = (
      <div
        className={classNames(inputClass, `${classPrefix}-input`, {
          [`${classPrefix}-is-readonly`]: readonly,
          [`${classPrefix}-is-disabled`]: disabled,
          [`${classPrefix}-is-focused`]: isFocused,
          [`${classPrefix}-size-s`]: size === 'small',
          [`${classPrefix}-size-l`]: size === 'large',
          [`${classPrefix}-align-${align}`]: align,
          [`${classPrefix}-is-${tStatus}`]: tStatus && tStatus !== 'default',
          [`${classPrefix}-input--prefix`]: prefixIcon || labelContent,
          [`${classPrefix}-input--suffix`]: suffixIconContent || suffixContent,
          [`${classPrefix}-input--focused`]: isFocused,
        })}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={(e) => onWheel?.({ e })}
        onClick={(e) => {
          inputRef.current?.focus();
          onClick?.({ e });
        }}
      >
        {prefixIconContent}
        {labelContent ? <div className={`${classPrefix}-input__prefix`}>{labelContent}</div> : null}
        {showInput && renderInput}
        {autoWidth && (
          <span ref={inputPreRef} className={`${classPrefix}-input__input-pre`}>
            {innerValue || placeholder}
          </span>
        )}
        {suffixContent || limitNumberNode ? (
          <div className={`${classPrefix}-input__suffix`}>
            {suffixContent}
            {limitNumberNode}
          </div>
        ) : null}
        {suffixIconContent}
      </div>
    );

    function togglePasswordVisible() {
      const toggleType = renderType === 'password' ? 'text' : 'password';
      setRenderType(toggleType);
    }

    function handleChange(
      e: React.ChangeEvent<HTMLInputElement> | React.CompositionEvent<HTMLInputElement>,
      trigger: InputContextTrigger = 'input',
    ) {
      let { value: newStr } = e.currentTarget;
      if (composingRef.current) {
        setComposingValue(newStr);
      } else {
        if (props.type !== 'number') {
          newStr = getValueByLimitNumber(newStr);
        }
        // 完成中文输入时同步一次 composingValue
        setComposingValue(newStr);
        onChange(newStr, { e, trigger });
      }
    }
    // 添加MouseDown阻止冒泡，防止點擊Clear value會導致彈窗閃爍一下
    // https://github.com/Tencent/tdesign-react/issues/2320
    function handleMouseDown(e: React.MouseEvent<SVGSVGElement, globalThis.MouseEvent>) {
      e.stopPropagation();
    }
    function handleClear(e: React.MouseEvent<SVGSVGElement>) {
      onChange?.('', { e, trigger: 'clear' });
      onClear?.({ e });
    }
    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      const {
        key,
        currentTarget: { value },
      } = e;
      key === 'Enter' && onEnter?.(value, { e });
      onKeydown?.(value, { e });
    }
    function handleKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
      const {
        currentTarget: { value },
      } = e;
      onKeyup?.(value, { e });
    }
    function handleKeyPress(e: React.KeyboardEvent<HTMLInputElement>) {
      const {
        currentTarget: { value },
      } = e;
      onKeypress?.(value, { e });
    }
    function handleCompositionStart(e: React.CompositionEvent<HTMLInputElement>) {
      composingRef.current = true;
      const {
        currentTarget: { value },
      } = e;
      onCompositionstart?.(value, { e });
    }
    function handleCompositionEnd(e: React.CompositionEvent<HTMLInputElement>) {
      const {
        currentTarget: { value },
      } = e;
      if (composingRef.current) {
        composingRef.current = false;
        handleChange(e);
      }
      onCompositionend?.(value, { e });
    }

    function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
      if (readonly) return;
      const {
        currentTarget: { value },
      } = e;
      onFocus?.(value, { e });
      toggleIsFocused(true);
    }

    function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
      if (readonly) return;
      const {
        currentTarget: { value },
      } = e;
      onBlur?.(value, { e });
      toggleIsFocused(false);
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
      const clipData = e.clipboardData;
      const pasteValue = clipData?.getData('text/plain');
      onPaste?.({ e, pasteValue });
    }

    function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>) {
      toggleIsHover(true);
      onMouseenter?.({ e });
    }

    function handleMouseLeave(e: React.MouseEvent<HTMLDivElement>) {
      toggleIsHover(false);
      onMouseleave?.({ e });
    }

    useImperativeHandle(ref as InputRef, () => ({
      currentElement: wrapperRef.current,
      inputElement: inputRef.current,
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      select: () => inputRef.current?.select(),
    }));

    return (
      <div
        ref={wrapperRef}
        style={style}
        className={classNames(`${classPrefix}-input__wrap`, className, {
          [`${classPrefix}-input--auto-width`]: autoWidth && !keepWrapperWidth,
        })}
        {...restProps}
      >
        {renderInputNode}
        {tips && (
          <div
            className={classNames(`${classPrefix}-input__tips`, `${classPrefix}-input__tips--${tStatus || 'default'}`)}
          >
            {tips}
          </div>
        )}
      </div>
    );
  },
  { Group: InputGroup },
);

Input.displayName = 'Input';

export default Input;
